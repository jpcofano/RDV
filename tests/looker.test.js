/**
 * tests/looker.test.js — el tablero de Looker en el sistema (44_Looker.js, 08/10): la ID (derivada 12), Datos_Unpivot y
 * Aux_Maximos.
 *
 *     node tests/looker.test.js
 *
 * 1. **Fidelidad**: si está la copia de lectura del script atado (`_externo/base-script/`, fuera del repo: no es nuestro
 *    código), se lo CORRE —`unpivotEventos` y `buildAuxMaximos`, con una planilla simulada— y el modo compatible tiene que
 *    dar exactamente lo mismo, fila por fila y celda por celda (salvo FechaCarga, la hora de la corrida). Sin la copia, esa
 *    parte se saltea y lo dice.
 * 2. **Las correcciones** (modo corregido): la ID, "Sin identificar" de género = Inscriptos − M − F (sin fila si no da
 *    positivo), sin P. Varon / P. Mujer; y que nada más cambie.
 * 3. **La ID**: el formato, sin barrio, vacía sin figura, las que repiten con la hora, y " (2)" si la hora no alcanza.
 *
 * NO sube a Apps Script (.claspignore: tests/**) y NO tiene datos reales: figuras y números inventados.
 */
'use strict';
process.env.TZ = 'America/Argentina/Buenos_Aires';
const vm = require('vm'), fs = require('fs'), path = require('path');

const RAIZ = path.join(__dirname, '..');
const EXTERNO = path.join(RAIZ, '_externo', 'base-script');
const pad = function (n) { return ('0' + n).slice(-2); };
const formatDate = function (d, tz, f) {
  return f.replace('yyyy', d.getFullYear()).replace('MM', pad(d.getMonth() + 1)).replace('dd', pad(d.getDate()))
    .replace('HH', pad(d.getHours())).replace('mm', pad(d.getMinutes())).replace('ss', pad(d.getSeconds()));
};

let fallas = 0;
function ok(cond, que) { console.log((cond ? '  ok   ' : '  FALLA ') + que); if (!cond) fallas++; }

// --- nuestro código ---
const ctx = { console: console, Date: Date, Math: Math, JSON: JSON, Map: Map, Set: Set, Number: Number, String: String,
              Logger: { log: function () {} }, Utilities: { formatDate: formatDate } };
vm.createContext(ctx);
['00_Config.js', '01_Utils.js', '44_Looker.js'].forEach(function (f) {
  vm.runInContext(fs.readFileSync(path.join(RAIZ, f), 'utf8'), ctx, { filename: f });
});

// --- RVD sintética: el encabezado del destino real (las 24 que exige el script atado, y las demás) ---
const HDR = ['Figura', 'Barrio', 'EVENTO', 'Día de la semana', 'FECHA', 'HORA', 'Dirección', 'One Page Entregado', 'STATUS REUNIÓN',
  'Observaciones', 'Inscriptos', 'Mail', 'Call Center', 'IVR', 'RRSS', 'Difusión', 'Asistentes', 'Oradores anotados',
  'Oradores que hablaron', 'Temas mas comentados', 'Semaforo politico', 'Síntesis cualitativa:', '% de Asistencia', 'Direccion2',
  'Falta Informacion', 'ID', 'Comuna', 'Poblacion', 'p. Mujer', 'P. Varon', '(km2)', '(hab/km2)', 'Zona', 'Masculinos', 'Femeninos',
  '18-24', '25-39', '40-55', '56-65', '66+', 'Sin identificar', 'RDV_UID'];
const C = function (n) { return HDR.indexOf(n); };
const D = function (d, m) { return new Date(2026, m - 1, d, 12, 0, 0); };
const H = function (h, m) { return new Date(1899, 11, 30, h, m || 0, 0); };
function fila(o) {
  const r = HDR.map(function () { return ''; });
  Object.keys(o).forEach(function (k) { r[C(k)] = o[k]; });
  return r;
}
const base = function (o) {
  return Object.assign({ EVENTO: 'Encuentro con Vecinos', 'Día de la semana': 'jueves', 'STATUS REUNIÓN': 'Realizada',
    Inscriptos: 100, Mail: 10, 'Call Center': 5, IVR: 3, RRSS: 7, 'Difusión': 2, Asistentes: 40, Masculinos: 56, Femeninos: 44,
    '18-24': 10, '25-39': 20, '40-55': 20, '56-65': 15, '66+': 15, 'Sin identificar': 20, 'P. Varon': 98765, 'p. Mujer': 104321 }, o);
};
function datos() {
  return [HDR.slice(),
    fila(base({ Figura: 'Ana Pereyra', Barrio: 'Palermo', FECHA: D(1, 10), HORA: H(19), ID: 'Ana Pereyra - Palermo - 01/10/2026' })),
    // sin ID: el script atado la arma con " | " y las fechas de JavaScript
    fila(base({ Figura: 'Bruno Salvatierra', Barrio: 'Flores', FECHA: D(2, 10), HORA: '18:00', 'STATUS REUNIÓN': 'en agenda', Asistentes: 0 })),
    // sin figura, con una ID vieja: el script atado la incluye; el sistema (ID vacía sin figura), no
    fila(base({ Figura: '', Barrio: 'Recoleta', FECHA: D(3, 10), HORA: H(18), ID: 'X | | | | |' })),
    // sin figura y sin ID: nadie la incluye
    fila(base({ Figura: '', Barrio: 'Recoleta', FECHA: D(3, 10) })),
    // texto, coma decimal, vacíos, un texto que no es número; Inscriptos − M − F negativo
    fila(base({ Figura: 'Carla Montenegro', Barrio: 'Belgrano', FECHA: D(4, 10), HORA: 0.75, Mail: '5', 'Call Center': '', IVR: 0,
                RRSS: '1,5', 'Difusión': 'abc', Inscriptos: 50, Masculinos: 30, Femeninos: 30, 'Sin identificar': 5, ID: 'C-4' })),
    // una Suspendida con asistentes: cuenta como realizada (queda igual)
    fila(base({ Figura: 'Diego Ferrandi', Barrio: 'Caballito', FECHA: D(5, 10), HORA: H(10), 'STATUS REUNIÓN': 'Suspendida',
                Asistentes: 3, ID: 'D-5' })),
    // con una categoría X: Inscriptos − M − F = 10
    fila(base({ Figura: 'Elena Quintero', Barrio: '', FECHA: '05/10/2026', HORA: H(17), Inscriptos: 100, Masculinos: 50,
                Femeninos: 40, ID: 'E-5' })),
    // dos reuniones de la misma figura, barrio y día: la ID nueva lleva la hora
    fila(base({ Figura: 'Fabián Rossetti', Barrio: 'Núñez', FECHA: D(6, 10), HORA: H(10), ID: 'F-6a' })),
    fila(base({ Figura: 'Fabián Rossetti', Barrio: 'Núñez', FECHA: D(6, 10), HORA: H(19, 30), ID: 'F-6b' })),
    // y dos a la misma hora: " (2)"
    fila(base({ Figura: 'Gisela Arambarri', Barrio: 'Almagro', FECHA: D(7, 10), HORA: H(18), ID: 'G-7a', 'STATUS REUNIÓN': '' })),
    fila(base({ Figura: 'Gisela Arambarri', Barrio: 'Almagro', FECHA: D(7, 10), HORA: H(18), ID: 'G-7b', 'STATUS REUNIÓN': 'OK' })),
    // una fecha como número de serie de Sheets
    fila(base({ Figura: 'Hugo Belmonte', Barrio: 'Retiro', FECHA: 46304, HORA: '9', ID: 'H-8' }))
  ];
}
const copia = function (m) { return m.map(function (r) { return r.slice(); }); };
const t = function (v) { return v instanceof Date ? 'D' + v.getTime() : JSON.stringify(v); };
const filaTxt = function (r) { return r.map(t).join('|'); };

// --- 1. Fidelidad: el script atado, corrido de verdad ---
console.log('[1] el modo compatible da exactamente lo mismo que el script atado');
const original = ['Unpivot2.js', 'Auxiliar.js'].map(function (f) { return path.join(EXTERNO, f); });
if (!original.every(function (f) { return fs.existsSync(f); })) {
  console.log('  (no está la copia del script atado en _externo/base-script/: se saltea la comparación con el original)');
} else {
  // Una planilla simulada, lo justo para las dos funciones del script atado.
  const hojas = {};
  const hoja = function (nombre, v) {
    const h = { nombre: nombre, v: v || [] };
    const asegurar = function (r, c) { while (h.v.length < r) h.v.push([]); h.v.forEach(function (fila) { while (fila.length < c) fila.push(''); }); };
    h.getDataRange = function () { return { getValues: function () { return copia(h.v); } }; };
    h.getRange = function (r, c, nr, nc) {
      nr = nr || 1; nc = nc || 1;
      return {
        setValue: function (x) { asegurar(r, c); h.v[r - 1][c - 1] = x; },
        setValues: function (m) { asegurar(r + nr - 1, c + nc - 1); m.forEach(function (fila, i) { fila.forEach(function (x, j) { h.v[r - 1 + i][c - 1 + j] = x; }); }); },
        setNumberFormat: function () {}
      };
    };
    h.clearContents = function () { h.v = []; };
    hojas[nombre] = h;
    return h;
  };
  const ssMock = { getSheetByName: function (n) { return hojas[n] || null; }, insertSheet: function (n) { return hoja(n); } };
  const ctxO = { console: console, Date: Date, Math: Math, JSON: JSON, Map: Map, Number: Number, String: String, Object: Object,
                 Logger: { log: function () {} }, Utilities: { formatDate: formatDate },
                 Session: { getScriptTimeZone: function () { return 'America/Argentina/Buenos_Aires'; } },
                 SpreadsheetApp: { getActiveSpreadsheet: function () { return ssMock; }, getActive: function () { return ssMock; } } };
  vm.createContext(ctxO);
  original.forEach(function (f) { vm.runInContext(fs.readFileSync(f, 'utf8'), ctxO, { filename: path.basename(f) }); });

  const rvd = hoja('RVD JM-CM - ES', datos());
  const antes = copia(rvd.v);
  ctxO.unpivotEventos();
  const suyas = hojas['Datos_Unpivot'].v;
  ctx.__d = antes;
  const nuestras = vm.runInContext('armarDatosUnpivot_(__d, { modo: "compatible", fechaCarga: "" })', ctx);
  ok(JSON.stringify(suyas[0]) === JSON.stringify(nuestras.encabezado), 'Datos_Unpivot: el mismo encabezado (' + suyas[0].length + ' columnas)');
  const sinFecha = function (r) { return r.slice(0, 11); };
  const igualesU = suyas.length - 1 === nuestras.filas.length &&
    nuestras.filas.every(function (r, i) { return filaTxt(sinFecha(r)) === filaTxt(sinFecha(suyas[i + 1])); });
  ok(igualesU, 'Datos_Unpivot: las mismas ' + nuestras.filas.length + ' filas, en el mismo orden, celda por celda (sin FechaCarga)' +
     (igualesU ? '' : ' — el original: ' + (suyas.length - 1) + ' filas'));
  if (!igualesU) {
    for (let i = 0; i < Math.max(suyas.length - 1, nuestras.filas.length); i++) {
      const a = nuestras.filas[i] ? filaTxt(sinFecha(nuestras.filas[i])) : '-', b = suyas[i + 1] ? filaTxt(sinFecha(suyas[i + 1])) : '-';
      if (a !== b) { console.log('      primera distinta, fila ' + (i + 2) + ':\n        sistema:  ' + a + '\n        original: ' + b); break; }
    }
  }
  const idGenerada = rvd.v[2][C('ID')];
  ok(/^Bruno Salvatierra \| Flores \| Encuentro con Vecinos \| jueves \| .*GMT-0300.* \| 18:00$/.test(idGenerada) &&
     nuestras.filas.some(function (r) { return r[0] === idGenerada; }) && nuestras.idsGenerados === 1,
     'la ID que el script atado escribía en RVD (" | " y la fecha de JavaScript), igual en el modo compatible: ' + idGenerada);

  // Aux_Maximos: el script atado lo corre sobre RVD con las ID que ya escribió unpivotEventos.
  ctxO.buildAuxMaximos();
  const suyasA = hojas['Aux_Maximos'].v;
  ctx.__d2 = copia(rvd.v);
  const nuestrasA = vm.runInContext('armarAuxMaximos_(__d2, { modo: "compatible" })', ctx);
  ok(JSON.stringify(suyasA[0]) === JSON.stringify(nuestrasA.encabezado), 'Aux_Maximos: el mismo encabezado (' + suyasA[0].length + ' columnas)');
  const igualesA = suyasA.length - 1 === nuestrasA.filas.length &&
    nuestrasA.filas.every(function (r, i) { return filaTxt(r) === filaTxt(suyasA[i + 1]); });
  ok(igualesA, 'Aux_Maximos: las mismas ' + nuestrasA.filas.length + ' filas, en el mismo orden, celda por celda');
  if (!igualesA) {
    for (let i = 0; i < Math.max(suyasA.length - 1, nuestrasA.filas.length); i++) {
      const a = nuestrasA.filas[i] ? filaTxt(nuestrasA.filas[i]) : '-', b = suyasA[i + 1] ? filaTxt(suyasA[i + 1]) : '-';
      if (a !== b) { console.log('      primera distinta, fila ' + (i + 2) + ':\n        sistema:  ' + a + '\n        original: ' + b); break; }
    }
  }
  ok(nuestrasA.filas.some(function (r) { return r[0] === 'Diego Ferrandi' && r[6] === 'Suspendida'; }),
     'la Suspendida con asistentes cuenta como realizada (queda igual)');
  ok(nuestrasA.filas.every(function (r) { return r[7] === null && r[8] === null && r[9] === '' && r[17] === '1'; }),
     'Inscriptos, Asistentes e ID de Aux_Maximos, vacías; Realizada_Flag "1" (quedan igual)');

  // Sin "Masculinos" / "Femeninos": el script atado toma "P. Varon" / "P. Mujer" (la población de la comuna).
  const hojaAlias = hoja('RVD JM-CM - ES', datos());
  hojaAlias.v[0][C('Masculinos')] = 'Masc.'; hojaAlias.v[0][C('Femeninos')] = 'Fem.';
  const antesAlias = copia(hojaAlias.v);
  ctxO.unpivotEventos();
  ctx.__da = antesAlias;
  const compatAlias = vm.runInContext('armarDatosUnpivot_(__da, { modo: "compatible", fechaCarga: "" })', ctx);
  const suyasAlias = hojas['Datos_Unpivot'].v.slice(1);
  ok(compatAlias.filas.length === suyasAlias.length &&
     compatAlias.filas.every(function (r, i) { return filaTxt(r.slice(0, 11)) === filaTxt(suyasAlias[i].slice(0, 11)); }) &&
     suyasAlias.some(function (r) { return r[9] === 'Masculinos' && r[10] === 98765; }),
     'sin Masculinos: el original y el compatible ponen la población de la comuna (98765) como "Masculinos"');
}

// --- 2. El modo corregido: sólo cambia lo aprobado ---
console.log('[2] el modo corregido: la ID, "Sin identificar" de género, sin P. Varon / P. Mujer; nada más');
ctx.__d = datos();
const ids = vm.runInContext('idsDerivados_(__d)', ctx);
ctx.__ids = ids;
const com = vm.runInContext('armarDatosUnpivot_(__d, { modo: "compatible", fechaCarga: "" })', ctx);
const cor = vm.runInContext('armarDatosUnpivot_(__d, { modo: "corregido", ids: __ids, fechaCarga: "" })', ctx);
const de = function (u, r) { return u.filas.filter(function (f, i) { return u.origen[i] === r; }); };
const cat = function (filas, c) { return filas.find(function (f) { return f[8] + '|' + f[9] === c; }); };
ok(de(cor, 1).every(function (f) { return f[0] === 'Ana Pereyra - Palermo - 01/10/2026'; }) && de(cor, 1).length === de(com, 1).length - 1,
   'la ID de la derivada; Ana: sin la fila de "Sin identificar" de género (100 − 56 − 44 = 0)');
ok(!cat(de(cor, 1), 'Género|Sin identificar') && cat(de(com, 1), 'Género|Sin identificar')[10] === 20,
   '"Sin identificar" de género: el compatible repetía el de edad (20); el corregido, 0 → sin fila');
ok(cat(de(cor, 7), 'Género|Sin identificar')[10] === 10, 'con una categoría X: 100 − 50 − 40 = 10');
ok(!cat(de(cor, 5), 'Género|Sin identificar') && cat(de(com, 5), 'Género|Sin identificar')[10] === 5,
   'negativo (50 − 30 − 30): sin fila (el compatible ponía el de edad, 5)');
ok(de(com, 3).length > 0 && de(cor, 3).length === 0, 'la fila sin figura con una ID vieja: el compatible la incluye; el corregido, no');
ok(de(com, 4).length === 0 && de(cor, 4).length === 0, 'sin figura y sin ID: ninguno');
// "nada más": todas las otras celdas, iguales
let otras = 0;
[1, 2, 5, 6, 7, 8, 9, 10, 11, 12].forEach(function (r) {
  de(com, r).forEach(function (f) {
    if (f[8] + '|' + f[9] === 'Género|Sin identificar') return;
    const g = cat(de(cor, r), f[8] + '|' + f[9]);
    if (!g || filaTxt(f.slice(1, 11)) !== filaTxt(g.slice(1, 11))) otras++;
  });
});
ok(otras === 0, 'todo lo demás, igual (salvo la ID): ' + otras + ' diferencias');
// Sin Masculinos / Femeninos: el corregido no usa la población de la comuna
const sinM = datos(); sinM[0][C('Masculinos')] = 'Masc.'; sinM[0][C('Femeninos')] = 'Fem.';
ctx.__s = sinM; ctx.__ids2 = vm.runInContext('idsDerivados_(__s)', ctx);
const corS = vm.runInContext('armarDatosUnpivot_(__s, { modo: "corregido", ids: __ids2, fechaCarga: "" })', ctx);
const comS = vm.runInContext('armarDatosUnpivot_(__s, { modo: "compatible", fechaCarga: "" })', ctx);
ok(!corS.filas.some(function (f) { return f[8] === 'Género'; }) && comS.filas.some(function (f) { return f[9] === 'Masculinos' && f[10] === 98765; }),
   'sin Masculinos ni Femeninos: el corregido no pone género (ni la población de la comuna); el compatible, sí');
// Aux_Maximos corregido: lo único que cambia es la fila sin figura con ID vieja (sale)
const auxC = vm.runInContext('armarAuxMaximos_(__d, { modo: "compatible" })', ctx);
const auxK = vm.runInContext('armarAuxMaximos_(__d, { modo: "corregido", ids: __ids })', ctx);
ok(auxC.filas.some(function (f) { return f[1] === 'Recoleta'; }) && !auxK.filas.some(function (f) { return f[1] === 'Recoleta'; }) &&
   auxK.filas.length < auxC.filas.length, 'Aux_Maximos corregido: sale la fila sin figura (su ID nueva es vacía); lo demás igual');
const sinRecoleta = auxC.filas.filter(function (f) { return f[1] !== 'Recoleta' && f[12] !== 'Recoleta'; });
ok(auxK.filas.filter(function (f) { return f[12] !== 'Recoleta'; }).length >= sinRecoleta.length - 6,
   'Aux_Maximos: las otras filas siguen (los totales del día de la de Recoleta, recalculados sin ella)');
// Un encabezado que falta: la solapa no se arma
const sinHora = datos(); sinHora[0][C('HORA')] = 'Horario';
ctx.__h = sinHora;
ok(/HORA/.test(vm.runInContext('armarDatosUnpivot_(__h, { modo: "corregido", ids: idsDerivados_(__h) }).error', ctx) || '') &&
   /HORA/.test(vm.runInContext('armarAuxMaximos_(__h, { modo: "corregido", ids: idsDerivados_(__h) }).error', ctx) || ''),
   'si falta una columna que se usa (HORA), ninguna de las dos se arma (y la corrida no las reescribe)');

// --- 3. La ID ---
console.log('[3] la ID (derivada 12)');
ok(ids[1] === 'Ana Pereyra - Palermo - 01/10/2026', 'Figura - Barrio - dd/MM/yyyy: ' + ids[1]);
ok(ids[7] === 'Elena Quintero - 05/10/2026', 'sin barrio, y con la FECHA como texto: ' + ids[7]);
ok(ids[3] === '' && ids[4] === '', 'vacía sin figura');
ok(ids[8] === 'Fabián Rossetti - Núñez - 06/10/2026 - 10:00' && ids[9] === 'Fabián Rossetti - Núñez - 06/10/2026 - 19:30',
   'las que repiten, con la hora: ' + ids[8] + ' / ' + ids[9]);
ok(ids[10] === 'Gisela Arambarri - Almagro - 07/10/2026 - 18:00' && ids[11] === 'Gisela Arambarri - Almagro - 07/10/2026 - 18:00 (2)',
   'si la hora no alcanza: " (2)": ' + ids[11]);
ok(/^Hugo Belmonte - Retiro - \d{2}\/\d{2}\/\d{4}$/.test(ids[12]), 'la FECHA como número de serie: ' + ids[12]);
ok(new Set(ids.filter(Boolean)).size === ids.filter(Boolean).length, 'ninguna repetida');
ok(vm.runInContext('horaHHmm_(0.75) + "|" + horaHHmm_("9") + "|" + horaHHmm_("19:05:00") + "|" + horaHHmm_("")', ctx) === '18:00|09:00|19:05|',
   'la hora como HH:mm (fracción del día, "9", "19:05:00", vacía)');
ok(vm.runInContext('conLooker_(true, function () { return esColumnaDerivada_("ID") && columnasDerivadas_().length === 12; })', ctx) &&
   !vm.runInContext('conLooker_(false, function () { return esColumnaDerivada_("ID"); })', ctx) &&
   vm.runInContext('LOOKER_EN_SISTEMA && esColumnaDerivada_("ID")', ctx),
   'la ID es derivada (la 12) sólo con LOOKER_EN_SISTEMA (prendido desde el 08/10; apagado: no)');

console.log(fallas ? '\n' + fallas + ' FALLA(S)' : '\nTodo en verde.');
process.exit(fallas ? 1 : 0);
