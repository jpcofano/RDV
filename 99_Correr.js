/**
 * 99_Correr.js — EL ÚNICO ARCHIVO QUE HAY QUE ABRIR PARA CORRER ALGO.
 *
 * Es un índice: cada función de acá llama a la que hace el trabajo en su archivo y loguea qué
 * está por pasar. **Nada de lógica propia.** Si un wrapper hace algo más que llamar y loguear,
 * deja de ser un índice y pasa a ser un lugar más donde se puede desincronizar el criterio —
 * que es el problema de fondo de esta migración (los dos `mapBarrioCanon_`, 3.1.h).
 *
 * El prefijo `99_` es a propósito: carga último y no define nada que otro archivo use, así que
 * no puede pisar nada.
 *
 * **Se mantiene al día en el mismo commit** en que cambia qué hay que correr (CLAUDE.md §6).
 *
 * ============================================================================================
 *  DÓNDE ESTAMOS — al 2026-10-01                                  (detalle: docs/ESTADO.md)
 * ============================================================================================
 *
 *  Antes de nada: `clasp push` desde la carpeta Rdv, si hubo commits desde el último.
 *
 *  DRY_RUN = true   en 20_UpsertDestino.js. El upsert NO puede tocar el destino.
 *                   No se cambia hasta haber leído los números del paso 2.
 *                   (Cada paso loguea el valor real al arrancar, por si alguien lo cambió.)
 *
 *  >>> CORRER DESPUÉS DE LAS 17 (regla operativa del 01/10: formularios y barrios se cargan a lo
 *      largo del día). Consultas nuevas para el equipo: docs/ESTADO.md, 1a.
 *
 *  >>> PRÓXIMO, en este orden (todos sólo leen, ninguno toca el destino). Predicciones en
 *      docs/ESTADO.md, sección 1, anotadas antes de correr:
 *      1. paso2_upsertEnSeco(). Con el VETO multi_figura sobre el ganador del desempate (la 801
 *         se escribe con "Seguridad - Comuna 13 - 24/9") y los 18 EJES CONFIRMADOS. Ventana:
 *         285 | 18 | 6; sin_figura_por_ubicacion 16 | 16 (si sube más, revisar fila por fila);
 *         ejes 18 / 30; "perderían por el eje" 1 | 1 (la 613); decididas por el eje 0. Líneas nuevas: empates con multi_figura, sin_formulario_propio una por
 *         una (marca las que antes eran score_bajo), y el 2e avisa si los barrios con eje no
 *         son 18 (hoy 19; sospecha San Nicolás en Este).
 *      2. paso10_validarContraInscriptos(). Desempates 36 / 36.
 *      3. paso13_formulariosSinFila(). B fila 806 (Seguridad Comuna 13 24/9) sale de "sin fila";
 *         quedan 6 en ventana.
 *      Para revisar antes de DRY_RUN = false: paso15_resumenParaRevisar(). Backup y vuelta atrás:
 *      docs/backup.md, sección 8. El activador de las 18:00 está PREPARADO, NO instalado.
 *      Cuando haga falta mirar un caso: paso12_explicarFormulario() / paso12_explicarFila(),
 *      editando CASO_A_EXPLICAR (más abajo). paso11 y paso14 cuando se quiera.
 *
 *  LÍNEA BASE vigente: la corrida en seco del 01/10 18:23 (5f84cc1). Corte de ventana FIJO en
 *  26/03/2026 (VENTANA_ANALISIS_DESDE), [ventana | total]: escribiría 284 | 753 (entró la 626,
 *  salió la 801 por la regresión del veto multi_figura), a revisar 19 | 43, sin match 6 | 13.
 *  La de las 18:04 (e921457), en docs/ESTADO.md:
 *
 *        escribiría   284     predicción era 283-290
 *        a revisar      9                    10-16
 *        sin match     16                    3-8    (las 9 de Lombardi por apellido)
 *
 *      Las anteriores (25/09 18:13, 26/09 11:36, 14:21, 16:45, 17:44 y 30/09 14:19) están en
 *      docs/ESTADO.md.
 *
 *  La secuencia, en orden:
 *
 *   paso1_columnasDeTraza()   → correrFase2b()   ESCRIBE en el destino: sólo 5 encabezados al
 *                                                final. Idempotente. YA CORRIÓ (25/09): el
 *                                                destino tiene las cinco.
 *   paso2_upsertEnSeco()      → correrEnSeco()   NO toca el destino. Escribe REVISAR_MATCH,
 *                                                EMPAREJAR_MANUAL y SIN_MATCH en la intermedia.
 *                                                El log trae: 2b desvío real del grupo bajo
 *                                                (tres poblaciones), 2e ¿Zona == eje? y
 *                                                temáticos sin fila a ±3, 2f por qué no entran
 *                                                las de comuna coincidente.
 *     si falla un reporte:  paso2_rehacer_revisarMatch / _emparejarManual / _sinMatch
 *   paso3_medirReglaDelMes()  → diagCorteB()     NO toca el destino. Escribe DIAG_CORTE_B en la
 *                                                intermedia; el bloque "LA REGLA DEL MES" va
 *                                                al log, y ahí se confirma que las 20
 *                                                desfase_reprogramacion son el destino corrido
 *                                                1-3 días y no un error del parser.
 *   paso6_medirFormulariosSinFigura() → medirFormulariosSinFigura()   NO escribe en ninguna
 *                                                planilla: sólo log. Recalcula el plan (como el
 *                                                paso 2, sin escribir los reportes).
 *   paso7_formulariosFaltantes() → diagFormulariosFaltantes()   NO escribe en ninguna planilla:
 *                                                sólo log. Lee además Hoja1 del origen (3) por
 *                                                openById, sólo lectura.
 *   (paso 8 ya corrió: rehacer_medirVariantesSinFigura(), en YA CORRIDOS.)
 *   (paso 9 ya corrió y se implementó: rehacer_medirDesempatePorEvidencia(), en YA CORRIDOS.)
 *   paso10_validarContraInscriptos() → medirValidacionInscriptos()   NO escribe en ninguna
 *                                                planilla: sólo log. Calibración de una vez,
 *                                                con la búsqueda inversa al final.
 *   paso11_desacuerdoUbicacion() → medirDesacuerdoUbicacion()   sólo log.
 *   paso12_explicarFormulario() / paso12_explicarFila() → diagnostico/06_revisar_casos.js
 *                                                sólo log. Leen CASO_A_EXPLICAR.
 *   paso13_formulariosSinFila() → listarFormulariosSinFila()   sólo log, informativo.
 *   paso14_formulasDestino() → diagFormulasDestino()   sólo log; lee el destino y Comunas.
 *   paso15_resumenParaRevisar() → resumenParaRevisar()   sólo log: REVISAR_MATCH de la ventana por
 *                                                motivo, con la 1ª opción y su puntaje.
 *   (fase7_… — el activador diario de las 18:00: PREPARADO Y COMENTADO, ver 99_Pipeline.js.)
 *
 *  Los pasos 4 y 5 ya corrieron y cerraron su pregunta; están abajo, en YA CORRIDOS:
 *   rehacer_medirFiguraEnPrefijo()  (25/09 20:18) EVITA 0 | 0, PIERDE 18 | 41 → la figura se
 *                                   busca sobre el texto completo.
 *   rehacer_verificarLegToDate()    (25/09 23:26) gana una copia día primero y a la línea 72
 *                                   sólo le llegan Date → el pendiente de legToDate_ es latente.
 *
 *  Qué mirar en cada log y qué decide cada número: docs/ESTADO.md, sección 2.
 *
 *  Más abajo, en un bloque aparte: los diagnósticos YA CORRIDOS, por si hay que rehacerlos.
 * ============================================================================================
 */

// ===================== La secuencia de ahora =====================

function paso1_columnasDeTraza() {
  _anunciar_('paso 1 — columnas de traza', 'correrFase2b()  [05_Escritura.js]',
             'SÍ, en el destino: sólo los encabezados de COLUMNAS_TRAZA que falten, al final',
             'el log dice cuáles agregó; si no falta ninguna, no hace nada');
  return correrFase2b();
}

function paso2_upsertEnSeco() {
  _anunciar_('paso 2 — upsert en seco', 'correrEnSeco()  [20_UpsertDestino.js]',
             'NO en el destino (fuerza DRY_RUN aunque la constante diga otra cosa)',
             'log (bloques 2b, 2e y 2f) + solapas REVISAR_MATCH, EMPAREJAR_MANUAL y ' +
             'SIN_MATCH en la intermedia');
  return correrEnSeco();
}

/* Sólo si en el paso 2 falló la escritura de un reporte: recalculan y escriben ése solo. */

function paso2_rehacer_revisarMatch() {
  _anunciar_('paso 2, rehacer un reporte', 'soloRevisarMatch()  [20_UpsertDestino.js]',
             'NO en el destino', 'solapa REVISAR_MATCH en la intermedia');
  return soloRevisarMatch();
}

function paso2_rehacer_emparejarManual() {
  _anunciar_('paso 2, rehacer un reporte', 'soloEmparejarManual()  [20_UpsertDestino.js]',
             'NO en el destino', 'solapa EMPAREJAR_MANUAL en la intermedia');
  return soloEmparejarManual();
}

function paso2_rehacer_sinMatch() {
  _anunciar_('paso 2, rehacer un reporte', 'soloSinMatch()  [20_UpsertDestino.js]',
             'NO en el destino', 'solapa SIN_MATCH en la intermedia');
  return soloSinMatch();
}

function paso3_medirReglaDelMes() {
  _anunciar_('paso 3 — medir la regla del mes', 'diagCorteB()  [diagnostico/02_corte_B_a_B2.js]',
             'NO en el destino (sólo lectura)',
             'solapa DIAG_CORTE_B en la intermedia + bloque "LA REGLA DEL MES" en el log');
  return diagCorteB();
}

function paso6_medirFormulariosSinFigura() {
  _anunciar_('paso 6 — formularios que no nombran a nadie',
             'medirFormulariosSinFigura()  [20_UpsertDestino.js]',
             'NO escribe en ninguna planilla (recalcula el plan del upsert en memoria)',
             'sólo el log: formularios sin figura por forma, filas de su misma comuna a 0 y ±3 ' +
             'días, y cuántas filas que hoy se escriben tendrían empate o rival');
  return medirFormulariosSinFigura();
}

function paso7_formulariosFaltantes() {
  _anunciar_('paso 7 — formularios faltantes o mal fechados',
             'diagFormulariosFaltantes()  [diagnostico/05_formularios_faltantes.js]',
             'NO escribe en ninguna planilla (recalcula el plan en memoria; lee Hoja1 del origen)',
             'sólo el log: candidatos a mal fechado, B contra Hoja1, y la lista de FORMULARIOS ' +
             'FALTANTES para quien mantiene la consulta');
  return diagFormulariosFaltantes();
}

function paso10_validarContraInscriptos() {
  _anunciar_('paso 10 — validación contra los inscriptos del destino (calibración de una vez)',
             'medirValidacionInscriptos()  [20_UpsertDestino.js]',
             'NO escribe en ninguna planilla (recalcula el plan del upsert en memoria)',
             'sólo el log: cobertura, destino vs formulario elegido, los resueltos del paso 9 y ' +
             'los choques del invariante contra los inscriptos cargados. NO entra en el score');
  return medirValidacionInscriptos();
}

function paso11_desacuerdoUbicacion() {
  _anunciar_('paso 11 — reubicaciones: figura y fecha coincidentes, ubicación en desacuerdo',
             'medirDesacuerdoUbicacion()  [20_UpsertDestino.js]',
             'NO escribe en ninguna planilla (recalcula el plan del upsert en memoria)',
             'sólo el log: pares figura + fecha 0-1 + ubicación en desacuerdo, en qué quedó cada ' +
             'fila, si el par está en EMPAREJAR_MANUAL, y cuáles son sin ambigüedad (para decidir ' +
             'si se escriben solos)');
  return medirDesacuerdoUbicacion();
}

/**
 * El caso que explican los dos paso12_*. Editar y correr:
 *   paso12_explicarFormulario → número de fila de B, o un texto que esté en el nombre del formulario
 *   paso12_explicarFila       → número de fila del destino
 */
const CASO_A_EXPLICAR = 'Bereciartua - Comuna 6';

function paso12_explicarFormulario() {
  _anunciar_('paso 12 — explicar un formulario (CASO_A_EXPLICAR = ' + CASO_A_EXPLICAR + ')',
             'explicarFormulario()  [diagnostico/06_revisar_casos.js]',
             'NO escribe en ninguna planilla (recalcula el plan del upsert en memoria)',
             'sólo el log: fecha y su fuente, figuras, ubicación, inscriptos, y cada fila de su ' +
             'figura a ±21 días con el score señal por señal y la puerta de EMPAREJAR_MANUAL');
  return explicarFormulario(CASO_A_EXPLICAR);
}

function paso12_explicarFila() {
  _anunciar_('paso 12 — explicar una fila del destino (CASO_A_EXPLICAR = ' + CASO_A_EXPLICAR + ')',
             'explicarFila()  [diagnostico/06_revisar_casos.js]',
             'NO escribe en ninguna planilla (recalcula el plan del upsert en memoria)',
             'sólo el log: veredicto y traza de la fila, y cada formulario de su figura a ±21 ' +
             'días con el score señal por señal y la puerta de EMPAREJAR_MANUAL');
  return explicarFila(CASO_A_EXPLICAR);
}

function paso13_formulariosSinFila() {
  _anunciar_('paso 13 — formularios sin fila: canceladas o reubicadas (INFORMATIVO)',
             'listarFormulariosSinFila()  [diagnostico/06_revisar_casos.js]',
             'NO escribe en ninguna planilla (recalcula el plan del upsert en memoria)',
             'sólo el log: formularios sin ningún candidato con MIN_INSCRIPTOS_SIN_FILA o más, en ' +
             'dos listas: "posible reemplazo / reunión reubicada" y "sin fila (posible cancelada)"');
  return listarFormulariosSinFila();
}

function paso14_formulasDestino() {
  _anunciar_('paso 14 — fórmulas del destino contra Comunas',
             'diagFormulasDestino()  [diagnostico/07_formulas_destino.js]',
             'NO escribe en ninguna planilla (lee valores y fórmulas del destino y Comunas)',
             'sólo el log: las once derivadas conservan su fórmula, las siete de lookup leen la ' +
             'columna correcta de Comunas, y sus valores son los de Comunas de hoy');
  return diagFormulasDestino();
}

function paso15_resumenParaRevisar() {
  _anunciar_('paso 15 — resumen de REVISAR_MATCH para revisar (ventana)',
             'resumenParaRevisar()  [diagnostico/06_revisar_casos.js]',
             'NO escribe en ninguna planilla (recalcula el plan del upsert en memoria)',
             'sólo el log: las filas a revisar de la ventana, agrupadas por motivo, con la primera ' +
             'opción y su puntaje. El detalle (tres opciones, "elegido") está en REVISAR_MATCH');
  return resumenParaRevisar();
}

// =============================================================================================
//  FASE 7 — el activador diario de las 18:00. PREPARADO, NO INSTALADO (01/10).
//  Está comentado a propósito: para instalarlo, descomentar el wrapper, correrlo UNA vez y volver
//  a comentarlo. Antes, anotarlo en docs/triggers-legado.md. Ver 99_Pipeline.js.
// =============================================================================================
/*
function fase7_instalarActivadorDiario() {
  _anunciar_('fase 7 — instalar el activador diario (18:00)', 'instalarActivadorDiario_()  [99_Pipeline.js]',
             'crea UN activador de tiempo que llama a upsertDiario todos los días a las 18',
             'el log dice si lo creó o si ya existía');
  return instalarActivadorDiario_();
}

function fase7_borrarActivadorDiario() {
  _anunciar_('fase 7 — borrar el activador diario', 'borrarActivadorDiario_()  [99_Pipeline.js]',
             'borra los activadores que llaman a upsertDiario; ningún otro',
             'el log dice cuántos borró');
  return borrarActivadorDiario_();
}
*/

// =============================================================================================
//  YA CORRIDOS — dejar por si hace falta rehacerlos. No son parte de la secuencia de ahora.
//  Ninguno escribe en el destino: escriben su solapa DIAG_* en la intermedia, o sólo el log.
// =============================================================================================

/**
 * Qué compraba limpiarPrefijos_ para la figura. Corrió el 25/09 20:18: EVITA 0 | 0, PIERDE
 * 18 | 41. La figura pasó a buscarse sobre el texto completo. Sigue midiendo lo mismo.
 */
function rehacer_medirFiguraEnPrefijo() {
  _anunciar_('ya corrido — la figura en el prefijo', 'medirFiguraEnPrefijo()  [20_UpsertDestino.js]',
             'NO escribe en ninguna planilla (lee B, la columna Figura del destino y Comunas)',
             'sólo el log: formularios que PIERDEN la figura con la limpieza contra los que ' +
             'EVITAN multi_figura, agrupados por par prefijo → cuerpo');
  return medirFiguraEnPrefijo();
}

/**
 * Qué copia de legToDate_ gana y qué le llega a la línea 72 del activador de Agenda. Corrió el
 * 25/09 23:26: día primero, y sólo le llegan Date. Rehacerlo después de cada cambio de orden de
 * archivos o si alguien empieza a tipear fechas en Fecha (manual).
 */
function rehacer_verificarLegToDate() {
  _anunciar_('ya corrido — qué legToDate_ gana', 'diagLegToDate()  [diagnostico/04_legado_fechas.js]',
             'NO escribe en ninguna planilla (lee la solapa Agenda del archivo (4))',
             'sólo el log: la respuesta de legToDate_ a \'03/04/2026\' (dice qué copia gana) y el ' +
             'conteo de Date / string / ambiguos en Fecha (manual) y Fecha (auto)');
  return diagLegToDate();
}

/**
 * Las variantes del cambio "sin figura". Corrió el 26/09 16:46: D-C recuperaba 12 de 14 filas
 * objetivo con costo 0 | 0 y se implementó (SIN_FIGURA_POR_UBICACION). Queda como registro: sigue
 * simulando sobre el alcanzable de ANTES de la regla (alcanzableBase), pero los "hoy" del log ya
 * incluyen la regla, así que sus números no son comparables con los del 26/09.
 */
function rehacer_medirVariantesSinFigura() {
  _anunciar_('ya corrido — variantes del cambio "sin figura"',
             'medirVariantesSinFigura()  [20_UpsertDestino.js]',
             'NO escribe en ninguna planilla (recalcula el plan del upsert en memoria)',
             'sólo el log: por variante, filas objetivo que llegan, costo y los casos');
  return medirVariantesSinFigura();
}

/**
 * El desempate por evidencia. Corrió el 26/09 17:06 y 17:44 (39 de 39 resueltas; 36 de 38
 * coinciden con el destino) y se implementó (DESEMPATE_POR_EVIDENCIA). Queda como registro: ahora
 * mide sólo las margen_chico que el desempate implementado NO resolvió.
 */
function rehacer_medirDesempatePorEvidencia() {
  _anunciar_('ya corrido — desempate por evidencia',
             'medirDesempatePorEvidencia()  [20_UpsertDestino.js]',
             'NO escribe en ninguna planilla (recalcula el plan del upsert en memoria)',
             'sólo el log: las margen_chico que siguen en revisión, y los "Genérico"');
  return medirDesempatePorEvidencia();
}

/** Fase 1, los cinco juntos: el hueco de sexo/edades contra los dos saltos del staging. */
function rehacer_diagFase1()           { _anunciarDiag_('diagFase1()', 'las 5 DIAG_ de la Fase 1');    return diagFase1(); }
/** Filas sin sexo/edades: ¿existen en B2? ¿en Para Revisar? ¿dónde se cortó? */
function rehacer_diagHueco()           { _anunciarDiag_('diagHuecoSexoEdades()', 'DIAG_HUECO');         return diagHuecoSexoEdades(); }
/** Qué valor de canales traería B2 contra lo que hay hoy en el destino. */
function rehacer_diagPisado()          { _anunciarDiag_('diagPisado()', 'DIAG_PISADO');                 return diagPisado(); }
/** Filas donde Inscriptos y canales entraron a medias. */
function rehacer_diagAtomicidad()      { _anunciarDiag_('diagAtomicidad()', 'DIAG_ATOMICIDAD');         return diagAtomicidad(); }
/** Filas donde el Inscriptos del destino no es el de B2 (total manual vs. desagregado). */
function rehacer_diagTotalDivergente() { _anunciarDiag_('diagTotalDivergente()', 'DIAG_TOTAL_DIVERGENTE'); return diagTotalDivergente(); }
/** Celdas #4F81BD en las COLUMNAS_MANUALES: cuánto aporta el pipeline. */
function rehacer_diagProcedencia()     { _anunciarDiag_('diagProcedencia()', 'DIAG_PROCEDENCIA');       return diagProcedencia(); }

/** Fase 1b, los dos juntos: dónde se corta B → B2, y las claves duplicadas de B2. */
function rehacer_diagFase1b()          { _anunciarDiag_('diagFase1b()', 'DIAG_CORTE_B + DIAG_DUP_B2');  return diagFase1b(); }
/** El ancla de fechas a fecha_fin. Medición CERRADA: el ancla quedó descartada (3.3.c). */
function rehacer_diagAnclaFecha()      { _anunciarDiag_('diagAnclaFecha()', 'DIAG_ANCLA_FECHA');        return diagAnclaFecha(); }
/** Distribución de scores y barrido de umbrales. La fecha ya usa el criterio del upsert. */
function rehacer_diagScores()          { _anunciarDiag_('diagScores()', 'DIAG_SCORES');                 return diagScores(); }
/** Desvío entre fecha_fin y la FECHA del destino, en las filas que sí matchean contra B2. */
function rehacer_diagFechaFin()        { _anunciarDiag_('diagFechaFin()', 'DIAG_FECHA_FIN');            return diagFechaFin(); }
/** Asunto, fecha y cuerpo crudo de los mails de agenda (Fase 8a). Sólo lectura sobre Gmail. */
function rehacer_diagMuestrasMail()    { _anunciarDiag_('diagMuestrasMail()', 'DIAG_MAILS');            return diagMuestrasMail(); }
/** Encabezados reales de destino, Para Revisar, B2 y A2, para completar fixtures/. Sólo log. */
function rehacer_diagEsquemas() {
  _anunciar_('diagnóstico ya corrido, rehaciéndolo', 'diagEsquemas()',
             'NO escribe en ninguna planilla', 'sólo el log');
  return diagEsquemas();
}

// ===================== Logs =====================

function _anunciar_(que, llama, escribe, salida) {
  Logger.log('=== %s ===', que);
  Logger.log('  llama a ....... %s', llama);
  Logger.log('  escribe ....... %s', escribe);
  Logger.log('  la salida ..... %s', salida);
  Logger.log('  DRY_RUN ....... %s  (20_UpsertDestino.js)', DRY_RUN);
}

function _anunciarDiag_(llama, salida) {
  _anunciar_('diagnóstico ya corrido, rehaciéndolo', llama, 'NO en el destino (sólo lectura)',
             salida + ' en la intermedia');
}
