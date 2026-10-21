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
 *  0. TODO LO DE SÓLO LECTURA DEL CIERRE, DE UNA:
 *       c19_cierre_soloLectura()        SÓLO LECTURA: corre en orden c13, c20, c30, c40 y c44. Si no le alcanza el tiempo dice
 *                                       "FALTAN …": volvé a correrla y sigue donde quedó. Al final, "TERMINADO" y un RESUMEN con una
 *                                       línea por paso (LISTO / NO LISTO y qué mirar). Cada vez que termina, la próxima empieza de cero.
 *
 *  1. ESPERA TU OK (no hay que correr nada):
 *       AGENDA_REPROGRAMADA     mirá c13_reprogramadas() (sólo lectura; o el c19) y dame el OK: lo prendo.
 *       (BASE_ORDEN_POR_FECHA: PRENDIDO el 21/10, después del c04 y de la corrida de la hora que salió bien.)
 *
 *  2. EL GUARDIÁN (las columnas del sistema; GUARDIAN_ACTIVO, APAGADO). Primero aprobás la lista A / B / C:
 *       c20_guardian_enSeco()           SÓLO LECTURA (paso 111): las clases A / B / C de cada columna de la base (y las SIN CLASE),
 *                                       qué avisaría con una copia nueva (tiene que dar 0), contra la copia de hoy, y la prueba
 *                                       del orden parcial (tiene que FRENAR).
 *       c21_guardian_copiaNueva()       ESCRIBE sólo SISTEMA_COPIA (intermedia; nunca la base) (paso 112). Se puede repetir.
 *       c22_ocultarProteger_enSeco()    SÓLO LECTURA (+ la huella) (paso 113): qué columnas se ocultan y cuáles se protegen.
 *       c23_ocultarProteger()           ESCRIBE FORMATO (paso 114): oculta las técnicas, protección con ADVERTENCIA en las A y
 *                                       encabezado gris. Exige la huella del c22. Deshacer: c25.
 *       → dame el OK y prendo GUARDIAN_ACTIVO con GUARDIAN_MODO = 'avisar' (avisa, no restaura). Después corrés
 *       c24_ayuda()                     ESCRIBE sólo las solapas "GUÍA" y "LEER" (paso 48): qué columnas puede tocar el equipo.
 *       → tras unos días sin avisos falsos, dame el OK y paso a GUARDIAN_MODO = 'restaurar'.
 *
 *  3. LO VIEJO SE DEJA COMO ESTÁ (las solapas de revisión, sólo desde el 06/10):
 *       c30_corteRevision_enSeco()      SÓLO LECTURA (paso 116): por solapa (REVISAR_MATCH, SIN_MATCH, EMPAREJAR_MANUAL,
 *                                       HISTORICO_SIN_RESOLVER, IDS_SIN_CRUZAR, "se hizo y no está en la base"), qué líneas dejarían
 *                                       de aparecer. La última línea tiene que decir "VERIFICACIÓN: … OK".
 *       → dame el OK y prendo REVISION_DESDE_FECHA_CORTE. No borra ni cambia ningún dato: sólo deja de mostrarlo.
 *
 *  4. LA AGENDA, ETAPA 2 (en este orden; los interruptores, APAGADOS hasta tu OK):
 *     4a. "Agenda (mail)" con el formato de "Agenda Directa":
 *       c40_agendaDirecta_enSeco()      SÓLO LECTURA (paso 72): cómo quedaría "Agenda (mail)" con el formato de "Agenda Directa".
 *       c41_copiarDirecta_enSeco()      SÓLO LECTURA (paso 73): qué copiaría de lo que el equipo cargó en "Agenda Directa".
 *       c42_copiarDirecta()             ESCRIBE, UNA VEZ (paso 74): AGENDA_EQUIPO (intermedia, sin pisar nada) y oculta
 *                                       "Sugerencia - Equipo Directa" (no la borra). "Agenda Directa" sólo se lee.
 *       → avisame y prendo AGENDA_MAIL_FORMATO_DIRECTA.
 *     4b. Los avisos por mail: dame el OK, prendo AVISOS_MAIL_ACTIVO y corrés
 *       c43_probarMailAvisos()          manda UN mail de prueba a jpcofano2@gmail.com (paso 80). Sin el interruptor no manda nada.
 *     4c. La auditoría de los lunes:
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
 *       c25_deshacerOcultarProteger()    vuelve a mostrar lo ocultado y saca sólo las protecciones que puso el c23 (paso 115).
 */

// ===================== 0. Todo lo de sólo lectura del cierre =====================

function c19_cierre_soloLectura() {
  _anunciar_('c19 — el cierre, todo lo de SÓLO LECTURA (c13, c20, c30, c40, c44)', 'cierreSoloLectura_()  [52_RevisarTodo.js]',
             'NO escribe nada (sólo su progreso, en una propiedad del script)',
             'el log de cada paso y, al final, "TERMINADO" + RESUMEN, o "FALTAN: …" si hay que volver a correrla');
  return cierreSoloLectura_();
}

// ===================== 2. El guardián =====================

function c20_guardian_enSeco() { return paso111_guardian_enSeco(); }
function c21_guardian_copiaNueva() { return paso112_guardian_copiaNueva(); }
function c22_ocultarProteger_enSeco() { return paso113_ocultarProteger_enSeco(); }
function c23_ocultarProteger() { return paso114_ocultarProteger(); }
function c24_ayuda() { return paso48_ayuda(); }

// ===================== 3. Lo viejo se deja como está =====================

function c30_corteRevision_enSeco() { return paso116_corteRevision_enSeco(); }

// ===================== 4. La agenda, etapa 2 =====================

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
function c25_deshacerOcultarProteger() { return paso115_deshacerOcultarProteger(); }
