/**
 * 00_Correr.js — LO QUE TENÉS QUE CORRER (20/10, prompts 09 y 10). Es lo primero del editor: sólo lo que hay que correr a mano, en
 * orden. Lo que ya se corrió sale de acá. Todo lo demás (los pasoNN_ de la migración, las mediciones viejas) sigue en 99_Correr.js.
 *
 * Como 99_Correr.js: cada función llama a la que hace el trabajo y anuncia qué va a pasar. **Nada de lógica propia.**
 *
 * Ya corridos (20/10): c01 → c02 (la 824 corregida) y c03 → c04 (la base ordenada). Salieron de acá.
 *
 * ============================================================================================
 *  LO QUE TENÉS QUE CORRER — en este orden
 * ============================================================================================
 *
 *  1. ESPERAN TU OK (no hay que correr nada):
 *       BASE_ORDEN_POR_FECHA    lo prendo cuando me confirmes que la corrida de la hora después del c04 salió bien.
 *       AGENDA_REPROGRAMADA     mirá c13_reprogramadas() (sólo lectura) y dame el OK: lo prendo.
 *
 *  2. LO VIEJO SE DEJA COMO ESTÁ (las solapas de revisión, sólo desde el 06/10):
 *       c30_corteRevision_enSeco()      SÓLO LECTURA (paso 111): por solapa (REVISAR_MATCH, SIN_MATCH, EMPAREJAR_MANUAL,
 *                                       HISTORICO_SIN_RESOLVER, IDS_SIN_CRUZAR, "se hizo y no está en la base"), qué líneas dejarían
 *                                       de aparecer. La última línea tiene que decir "VERIFICACIÓN: … OK".
 *       → dame el OK y prendo REVISION_DESDE_FECHA_CORTE. No borra ni cambia ningún dato: sólo deja de mostrarlo.
 *
 *  3. LA AGENDA, ETAPA 2 (en este orden; los interruptores, APAGADOS hasta tu OK):
 *     3a. "Agenda (mail)" con el formato de "Agenda Directa":
 *       c40_agendaDirecta_enSeco()      SÓLO LECTURA (paso 72): cómo quedaría "Agenda (mail)" con el formato de "Agenda Directa".
 *       c41_copiarDirecta_enSeco()      SÓLO LECTURA (paso 73): qué copiaría de lo que el equipo cargó en "Agenda Directa".
 *       c42_copiarDirecta()             ESCRIBE, UNA VEZ (paso 74): AGENDA_EQUIPO (intermedia, sin pisar nada) y oculta
 *                                       "Sugerencia - Equipo Directa" (no la borra). "Agenda Directa" sólo se lee.
 *       → avisame y prendo AGENDA_MAIL_FORMATO_DIRECTA.
 *     3b. Los avisos por mail: dame el OK, prendo AVISOS_MAIL_ACTIVO y corrés
 *       c43_probarMailAvisos()          manda UN mail de prueba a jpcofano2@gmail.com (paso 80). Sin el interruptor no manda nada.
 *     3c. La auditoría de los lunes:
 *       c44_auditoriaSemanal_enSeco()   SÓLO LECTURA (paso 81): cómo quedaría la solapa del lunes y el resumen.
 *       → dame el OK, prendo AUDITORIA_SEMANAL_ACTIVA y corrés
 *       c45_instalarAuditoriaSemanal()  crea UN activador (lunes 8:00) (paso 82). Se niega con el interruptor apagado; no duplica.
 *
 * ============================================================================================
 *  CUANDO QUIERAS — sólo lectura
 * ============================================================================================
 *       c10_auditoria()                  la auditoría de la agenda (paso 66).
 *       c11_mediciones()                 los pasos 67, 104, 105 y 106 juntos (el 67: cuánto tarda cada parte de la corrida).
 *       c12_revisarTodo()                los pasos de revisión, todos (si no alcanza el tiempo, dice FALTAN: volvé a correrla).
 *       c13_reprogramadas()              (paso 110) desde el 15/07, qué cancelaciones del mail quedarían "Reprogramada" (con la
 *                                        fecha nueva) en vez de "Suspendida". Mirarlo antes de prender AGENDA_REPROGRAMADA.
 *
 * ============================================================================================
 *  SI ALGO SALE MAL
 * ============================================================================================
 *       c08_deshacerCorregirMacri1510()  vuelve la 824 a como estaba antes del c02 (sólo lo que todavía tiene lo que se escribió).
 *       c09_deshacerOrdenBase()          vuelve la base al orden de antes del c04.
 *       c46_borrarAuditoriaSemanal()     borra el activador de los lunes (paso 83).
 */

// ===================== 2. Lo viejo se deja como está =====================

function c30_corteRevision_enSeco() { return paso111_corteRevision_enSeco(); }

// ===================== 3. La agenda, etapa 2 =====================

function c40_agendaDirecta_enSeco() { return paso72_agendaDirecta_enSeco(); }
function c41_copiarDirecta_enSeco() { return paso73_copiarAgendaDirecta_enSeco(); }
function c42_copiarDirecta() { return paso74_copiarAgendaDirecta(); }
function c43_probarMailAvisos() { return paso80_probarMailAvisos(); }
function c44_auditoriaSemanal_enSeco() { return paso81_auditoriaSemanal_enSeco(); }
function c45_instalarAuditoriaSemanal() { return paso82_instalarAuditoriaSemanal(); }

// ===================== Cuando quieras (sólo lectura) =====================

function c10_auditoria() { return paso66_auditoriaAgenda(); }
function c11_mediciones() { return mediciones_soloLectura(); }
function c12_revisarTodo() { return revisarTodo(); }
function c13_reprogramadas() { return paso110_reprogramadas_enSeco(); }

// ===================== Si algo sale mal =====================

function c08_deshacerCorregirMacri1510() {
  _anunciar_('c08 — deshacer la corrección de la 824 (ESCRIBE)', 'deshacerCorregirReunion(false)  [58_CorregirReunion.js]',
             'SÍ: vuelve las celdas de la 824 que todavía tienen lo que escribió el c02', 'el log');
  return deshacerCorregirReunion(false);
}
function c09_deshacerOrdenBase() { return paso109_deshacerOrdenBase(); }
function c46_borrarAuditoriaSemanal() { return paso83_borrarAuditoriaSemanal(); }
