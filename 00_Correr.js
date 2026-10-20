/**
 * 00_Correr.js — LO QUE TENÉS QUE CORRER (20/10, prompt 09). Es lo primero del editor: sólo lo que hay que correr a mano, en orden.
 * Todo lo demás (los pasoNN_ de la migración, las mediciones viejas) sigue en 99_Correr.js.
 *
 * Como 99_Correr.js: cada función llama a la que hace el trabajo y anuncia qué va a pasar. **Nada de lógica propia.**
 *
 * ============================================================================================
 *  LO QUE TENÉS QUE CORRER — en este orden
 * ============================================================================================
 *
 *  1. Corregir la 824 (Macri 15/10): vuelve a ser la reunión del mail (Villa Santa Rita, Reprogramada al 23/10, sin los asistentes
 *     ni los oradores de la reunión de Villa Devoto, que no va: "manda el mail").
 *       c01_corregirMacri1510_enSeco()   SÓLO LECTURA. El plan y la próxima corrida SIMULADA. Tiene que dar LISTO (guarda la huella).
 *       c02_corregirMacri1510()          ESCRIBE la 824. Exige la huella del c01 (de menos de 2 horas). Sólo con tu OK.
 *
 *  2. Ordenar la base por FECHA (después del 1):
 *       c03_ordenBase_enSeco()           SÓLO LECTURA. Qué se movería y la próxima corrida simulada. Tiene que dar LISTO (guarda la huella).
 *       c04_ordenBase_ahora()            ESCRIBE (mueve las filas). Exige la huella del c03. Sólo con tu OK.
 *     Después del c04 y de una corrida de la hora que salga bien: avisame y prendo BASE_ORDEN_POR_FECHA.
 *
 *  3. c05_ayuda()                        ESCRIBE sólo las solapas "GUÍA" (base) y "LEER" (archivo "Agenda"), con las reglas nuevas
 *                                        ("manda el mail", "no va (fuera de nuestros canales)", la 824).
 *
 * ============================================================================================
 *  CUANDO QUIERAS — sólo lectura
 * ============================================================================================
 *       c10_auditoria()                  la auditoría de la agenda (paso 66).
 *       c11_mediciones()                 los pasos 67, 104, 105 y 106 juntos.
 *       c12_revisarTodo()                los pasos de revisión, todos (si no alcanza el tiempo, dice FALTAN: volvé a correrla).
 *       c13_reprogramadas()              (paso 110) desde el 15/07, qué cancelaciones del mail quedarían "Reprogramada" (con la
 *                                        fecha nueva) en vez de "Suspendida". Mirarlo antes de prender AGENDA_REPROGRAMADA.
 *
 * ============================================================================================
 *  SI ALGO SALE MAL
 * ============================================================================================
 *       c08_deshacerCorregirMacri1510()  vuelve la 824 a como estaba antes del c02 (sólo lo que todavía tiene lo que se escribió).
 *       c09_deshacerOrdenBase()          vuelve la base al orden de antes del c04.
 *
 *  Los pasos 101-103 (separar la 824 en dos filas) quedaron DESCARTADOS el 20/10: el equipo confirmó que la de Villa Devoto no va.
 */

function c01_corregirMacri1510_enSeco() {
  _anunciar_('c01 — corregir la 824, Macri 15/10 (EN SECO)', 'corregirReunion_enSeco()  [58_CorregirReunion.js]',
             'NO escribe la base (sólo guarda la huella, si está LISTO)',
             'el log: el plan, (1) los asistentes son los de RDV CONJUNTO Villa Devoto, (2) el formulario, la simulación de la próxima ' +
             'corrida (FUERA DE LO ESPERADO tiene que decir "nada"), (4) la agenda, (5) RDV CONJUNTO, LISTO / NO LISTO');
  return corregirReunion_enSeco();
}

function c02_corregirMacri1510() {
  _anunciar_('c02 — corregir la 824, Macri 15/10 (ESCRIBE)', 'corregirReunion()  [58_CorregirReunion.js]',
             'SÍ: sólo la 824 (Barrio, STATUS, Asistentes, Oradores, Tocado por el equipo y sus agenda_*_escrito) y las derivadas; ' +
             'REGISTRO_AGENDA (CORREGIR) y REGISTRO_AGENDA_CAMBIOS', 'el log; deshacer: c08_deshacerCorregirMacri1510()');
  return corregirReunion();
}

function c03_ordenBase_enSeco() {
  _anunciar_('c03 — ordenar la base por FECHA (EN SECO; paso 107)', 'ordenBase_enSeco()  [57_OrdenBase.js]',
             'NO escribe la base (sólo guarda la huella, si está LISTO)', 'el log: qué se movería, la simulación, LISTO / NO LISTO');
  return ordenBase_enSeco();
}

function c04_ordenBase_ahora() {
  _anunciar_('c04 — ordenar la base por FECHA (ESCRIBE; paso 108)', 'ordenarBaseAhora()  [57_OrdenBase.js]',
             'SÍ: mueve las filas de la base (cada una entera, con su formato); guarda el orden de antes en ORDEN_BASE_PREVIO',
             'el log; deshacer: c09_deshacerOrdenBase()');
  return ordenarBaseAhora();
}

function c05_ayuda() { return paso48_ayuda(); }

function c08_deshacerCorregirMacri1510() {
  _anunciar_('c08 — deshacer la corrección de la 824 (ESCRIBE)', 'deshacerCorregirReunion(false)  [58_CorregirReunion.js]',
             'SÍ: vuelve las celdas de la 824 que todavía tienen lo que escribió el c02', 'el log');
  return deshacerCorregirReunion(false);
}

function c09_deshacerOrdenBase() { return paso109_deshacerOrdenBase(); }

function c10_auditoria() { return paso66_auditoriaAgenda(); }

function c11_mediciones() { return mediciones_soloLectura(); }

function c12_revisarTodo() { return revisarTodo(); }

function c13_reprogramadas() { return paso110_reprogramadas_enSeco(); }
