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
 *  DÓNDE ESTAMOS — al 2026-10-02                                  (detalle: docs/ESTADO.md)
 * ============================================================================================
 *
 *  Antes de nada: `clasp push` desde la carpeta Rdv, si hubo commits desde el último.
 *
 *  >>> 05/10: derivadas — COPIA HECHA; DERIVADAS_POR_SCRIPT = true; ahora el REAL (ESTADO 0.u):
 *      paso25_compararDerivadas() → paso26_…_enSeco() → paso26_quitarFormulasDerivadas() → upsertDestino() →
 *      paso16_verificarEscritura().
 *  (05/10, antes) ANTES DE AGENDA — las derivadas por script. En la copia primero:
 *      paso25_compararDerivadas() (0 distintas) → paso26_…_enSeco() → paso26_quitarFormulasDerivadas() →
 *      DERIVADAS_POR_SCRIPT = true → paso26_recalcularDerivadas() → paso26_formulasDerivadas(). Volver: paso27.
 *  >>> 04/10: MIGRACIÓN AL REAL HECHA (ESTADO 0.t): paso 22 OK, paso 16 OK, paso 20 f = 0. Falta:
 *      paso23_listarActivadores() (sólo lectura) → borrar lo que marque BORRAR → paso24_instalarActivadorCadaHora()
 *      cuando el usuario confirme que el legado está apagado.
 *  >>> 03/10: RDV_HOJA_DESTINO VOLVIÓ AL REAL ("RVD JM-CM - ES"). Sigue la secuencia del real, desde el
 *      paso 2 (abajo, "Al pasar al real"; ESTADO 0.s). Lo que sigue de 02/10 es historia de la copia.
 *  02/10: RDV_HOJA_DESTINO apuntaba a la copia "AAA NOBORRAR" (00_Config.js).
 *      La primera escritura real (14:50) se cortó a los 6 minutos; la escritura se rehízo en lote
 *      y se prueba sobre la copia (el equipo trabaja en la real). Secuencia y predicción:
 *      docs/ESTADO.md, sección 0. La 309 ya está deshecha y form_clave agregada (18:14). Con el
 *      ajuste de los gemelos (GEMELOS_MAX_DIAS = 7, casi cero fuera del grupo; ESTADO 0.k):
 *        1. upsertDestino() una vez       [20_UpsertDestino.js] → form_clave en 697, 709, 134, 315, 768
 *        2. paso16_verificarEscritura()  → invariante 0, traza ambigua 0, 0 "<<< HOY", 0 incompletas
 *      Alcance nuevo (Inscriptos, canales, Asistentes; ESTADO 0.l): PASO A, sólo lectura.
 *  02/10 noche: PASO B implementado (Inscriptos, canales, Asistentes, color #CFE2F3; ESTADO 0.n).
 *      Prueba en la copia, en este orden:
 *        1. paso18_malEscritas_vaciarCopia()  → si todavía no se corrió
 *        2. paso16_verificarEscritura()       → línea de base de Barrio (anotarla en LINEA_BASE_AZULES)
 *        3. upsertDestino() una vez            [20_UpsertDestino.js]
 *        4. paso16_verificarEscritura()       → OK: invariante 0, Barrio sin subir, 0 incompletas
 *        5. paso19_repintarAzulViejo_enSeco() → cuántas en #4F81BD por columna; repintar cuando se decida
 *  03/10 tarde: DIAS_ACTIVOS = 30 (00_Config.js): el sistema trabaja sólo sobre las filas de hoy − 30 a
 *      hoy (escritura, fichas, "elegido", EMPAREJAR, paso 20); el invariante sigue sobre todo el historial.
 *      Y las FICHAS de REVISAR_MATCH (26_Fichas.js), APAGADAS (REVISAR_COMO_FICHAS = false) hasta validarlas:
 *        1. paso21_fichasDePrueba()  → las fichas de 631, 521, 274, 618, 309 al log + la solapa de prueba
 *        2. upsertDestino() una vez  → ~40-50 filas activas, nada nuevo que escribir, menos tiempo (ESTADO 0.q)
 *      03/10 16:37: 44 activas, 14 s, 3 fichas. Arreglos (ESTADO 0.r): opciones por puntaje, "¿por qué?" sobre
 *      la opción 1, confianza en palabras, eje sólo para la persona, gemelos descartados en el contexto,
 *      EMPAREJAR sin los formularios de reuniones cerradas. Otra vez paso21_fichasDePrueba() y mirar
 *      REVISAR_FICHAS_PRUEBA ANTES de prender REVISAR_COMO_FICHAS.
 *  03/10 21:51: fichas APROBADAS y PRENDIDAS (REVISAR_COMO_FICHAS = true). paso21_borrarSolapaDePrueba().
 *      Al pasar al real (ESTADO 0.s, con la predicción):
 *        1. RDV_HOJA_DESTINO = 'RVD JM-CM - ES', push y clasp push  [HECHO 03/10]   2. nombre a la versión del destino
 *        3. paso16_verificarEscritura()  (línea de base de Barrio)   4. paso1_columnasDeTraza()
 *        5. paso22_completarHistorial()  (repetir si se corta; una sola vez, todo el historial)
 *        6. paso16_verificarEscritura()  → OK, 0 incompletas en TODO el destino
 *        7. paso20_porQueVacia() con PASO20_DESDE = 2 → f = 0   8. upsertDestino() → no escribe nada
 *        9. paso19 en seco, después real (sin "Semaforo politico")   10. activador cada hora
 *  03/10: paso20_porQueVacia() (sólo lectura: la causa de cada celda vacía; "DEBERÍA ESTAR ESCRITA"
 *      tiene que dar 0) y la lectura de "elegido" en REVISAR_MATCH / EMPAREJAR_MANUAL (regla 4,
 *      25_Elecciones.js, docs/elegir-match.md). Con 0 elecciones cargadas, el upsert no cambia nada.
 *      Para volver: RDV_HOJA_DESTINO = 'RVD JM-CM - ES', push y clasp push (ESTADO 0.f).
 *      El activador NO se instala hasta volver y verificar la escritura real.
 *
 *  DRY_RUN = FALSE  en 20_UpsertDestino.js, desde el 02/10 (decisión del usuario, backup hecho).
 *                   upsertDestino() ESCRIBE en el destino (siempre por setSiDelSistema_).
 *                   Los pasoN_ de este archivo NO escriben: paso2 fuerza la corrida en seco.
 *                   Para frenar: DRY_RUN = true y clasp push (docs/backup.md §8.2).
 *                   (Cada paso loguea el valor real al arrancar.)
 *
 *  >>> 02/10: el activador va a correr CADA 1 HORA (preparado, NO instalado). Las filas de hoy o
 *      de ayer sin barrio quedan "pendiente_barrio" y se reevalúan solas. Detalle: ESTADO.md, 1b.
 *
 *  >>> PRÓXIMO, en este orden (todos sólo leen, ninguno toca el destino). Predicciones en
 *      docs/ESTADO.md, 1b, anotadas antes de correr:
 *      1. paso2_upsertEnSeco(). Con B ORDENADO por fecha_fin y las reglas nuevas. Tiene que dar
 *         lo mismo que con B sin ordenar; contra las 10:56 (285 | 18 | 7) sólo se mueve por la
 *         811 (si llegó su formulario) y por las que pasen a pendiente_barrio (línea nueva).
 *      2. paso16_verificarEscritura(), ANTES de escribir: la línea de base de azules (anotar los
 *         dos totales en 00_Config.js).
 *      3. paso15_resumenParaRevisar(): para revisar REVISAR_MATCH con las opciones.
 *      >>> PRIMERA ESCRITURA (02/10, DRY_RUN = false, backup hecho, línea de base 605 / 5749):
 *          upsertDestino() a mano UNA vez [20_UpsertDestino.js]; después
 *          paso16_verificarEscritura() hasta que dé OK. Si algo falla: docs/backup.md §8.2.
 *      Cuando haga falta mirar un caso: paso12_explicarFormulario() / paso12_explicarFila(),
 *      editando CASO_A_EXPLICAR (más abajo). paso10, paso11, paso13 y paso14 cuando se quiera.
 *
 *  LÍNEA BASE vigente: la corrida en seco del 02/10 10:56 (5ecaa4a), ventana 285 | 18 | 7 (la
 *  diferencia con la predicción 285 | 18 | 6 es la 811, de hoy, sin formulario todavía). La 801 se
 *  escribe; invariante 0; ejes 18 / 30. La anterior, 01/10 18:23 (5f84cc1), [ventana | total]:
 *  escribiría 284 | 753 (entró la 626, salió la 801), a revisar 19 | 43, sin match 6 | 13.
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
 *   paso16_verificarEscritura() → verificarEscritura()   sólo log: después de escribir (y antes,
 *                                                para la línea de base de azules).
 *   (paso23_listarActivadores / paso24_instalarActivadorCadaHora — los activadores, ver 99_Pipeline.js.)
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

function paso16_verificarEscritura() {
  _anunciar_('paso 16 — verificación de una escritura real (y línea de base, antes de la primera)',
             'verificarEscritura()  [diagnostico/08_verificar_escritura.js]',
             'NO escribe en ninguna planilla (lee el destino, B y REGISTRO_UPSERT)',
             'sólo el log: invariante en el destino, fórmulas (paso 14), azules contra la línea de ' +
             'base y filas con RDV_UID. Termina en OK o en HAY PROBLEMAS');
  return verificarEscritura();
}

function paso17_validarCuentas() {
  _anunciar_('paso 17 — PASO A: validación de cuentas (Inscriptos, canales, sexo, edades, Asistentes)',
             'validarCuentas()  [diagnostico/09_validar_cuentas.js]',
             'NO escribe en ninguna planilla (recalcula el plan en memoria; lee B, B2 y RDV CONJUNTO)',
             'sólo el log: por columna exacto | ≤5% | más contra el destino, contra B2, las filas con ' +
             'Inscriptos distinto y desagregado vacío, y el cruce de Asistentes del legado. Las ' +
             'diferencias se cuentan, NO se corrigen (criterio del 02/10)');
  return validarCuentas();
}

/*
 * PASO 18 — lo que el sistema escribió MAL el 02/10 (Sin identificar = Inscriptos, por los encabezados
 * nuevos de B). Primero LISTAR (en seco); después vaciar, la copia y el real por separado.
 */
function paso18_malEscritas_listar() {
  _anunciar_('paso 18 — mal escritas por el sistema desde el 02/10 (EN SECO)',
             'listarMalEscritas()  [diagnostico/10_mal_escritas.js]',
             'NO escribe en ninguna planilla (lee el real, la copia, B y el backup del 02/10)',
             'sólo el log: por solapa, cada celda mal escrita con el valor escrito y el correcto');
  return listarMalEscritas();
}

function paso18_malEscritas_vaciarCopia() {
  _anunciar_('paso 18 — VACIAR las mal escritas en la COPIA', 'vaciarMalEscritas()  [diagnostico/10_mal_escritas.js]',
             'SÍ, en "' + RDV_HOJA_COPIA_PRUEBA + '": vacía esas celdas y les saca el color (nada más)',
             'el log dice cuántas vació');
  return vaciarMalEscritas(RDV_HOJA_COPIA_PRUEBA);
}

function paso18_malEscritas_vaciarReal() {
  _anunciar_('paso 18 — VACIAR las mal escritas en el DESTINO REAL', 'vaciarMalEscritas()  [diagnostico/10_mal_escritas.js]',
             'SÍ, en "' + RDV_HOJA_DESTINO_REAL + '": vacía esas celdas y les saca el color (nada más)',
             'el log dice cuántas vació');
  return vaciarMalEscritas(RDV_HOJA_DESTINO_REAL);
}

/**
 * PASO 20 — "por qué está vacía": para cada celda vacía de las columnas del sistema, UNA causa. Sólo
 * lectura. El rango, acá. Los dos en null (por defecto desde el 03/10) = las filas ACTIVAS (DIAS_ACTIVOS).
 */
const PASO20_DESDE = null;
const PASO20_HASTA = null;   // con DESDE puesto: null = hasta el final

function paso20_porQueVacia() {
  _anunciar_('paso 20 — por qué está vacía (' + (PASO20_DESDE || PASO20_HASTA
               ? 'filas ' + (PASO20_DESDE || 2) + ' a ' + (PASO20_HASTA || 'el final') : 'filas activas') + ')',
             'porQueVacia()  [diagnostico/12_por_que_vacia.js]',
             'NO escribe en ninguna planilla (recalcula el plan y el cruce de Asistentes)',
             'sólo el log: cada celda vacía con su causa, el resumen por causa y la lista de las que ' +
             'DEBERÍAN ESTAR ESCRITAS (tiene que dar 0)');
  return porQueVacia(PASO20_DESDE, PASO20_HASTA);
}

/**
 * PASO 21 — las fichas de REVISAR_MATCH, de prueba (03/10). NO escribe el destino ni REVISAR_MATCH: sólo
 * la solapa RDV_HOJA_FICHAS_PRUEBA de la intermedia. Al log, las fichas de estas filas (estén o no
 * pendientes o activas), para validar las frases y las líneas de coincide / no coincide:
 */
const PASO21_FILAS = [631, 521, 274, 618, 309];

function paso21_fichasDePrueba() {
  _anunciar_('paso 21 — fichas de REVISAR_MATCH, de prueba (filas ' + PASO21_FILAS.join(', ') + ')',
             'fichasDePrueba()  [diagnostico/13_fichas_prueba.js]',
             'NO escribe el destino ni REVISAR_MATCH; escribe sólo la solapa "' + RDV_HOJA_FICHAS_PRUEBA + '" (intermedia)',
             'el log: las fichas pedidas, como texto con las marcas de color; la solapa de prueba, entera');
  return fichasDePrueba(PASO21_FILAS);
}

/** PASO 21b — borra la solapa de prueba de las fichas (aprobadas el 03/10). Sólo esa solapa, por nombre. */
function paso21_borrarSolapaDePrueba() {
  _anunciar_('paso 21b — borrar la solapa de prueba de las fichas', 'borrarSolapaFichasPrueba()  [diagnostico/13_fichas_prueba.js]',
             'SÍ, en la intermedia: borra la solapa "' + RDV_HOJA_FICHAS_PRUEBA + '" (nada más)', 'el log dice si la borró');
  return borrarSolapaFichasPrueba();
}

/**
 * PASO 22 — completar el historial (03/10): el upsert UNA VEZ sobre TODAS las filas, sin el límite de
 * DIAS_ACTIVOS (sólo esa corrida: la constante no cambia). Mismas reglas (sólo celda vacía, invariante,
 * traza, color, LockService, REGISTRO_UPSERT). Si se corta, se vuelve a correr y sigue. Lo viejo que no se
 * resuelve solo va a HISTORICO_SIN_RESOLVER (informativa); las fichas, sólo los últimos 30 días.
 */
function paso22_completarHistorial() {
  _anunciar_('paso 22 — completar el historial (todas las filas, una vez)', 'completarHistorial()  [20_UpsertDestino.js]',
             DRY_RUN ? 'NO (DRY_RUN = true): sólo calcula' : 'SÍ, en "' + RDV_HOJA_DESTINO + '": sólo celdas vacías, en ' + COLOR_SISTEMA,
             'el log de siempre del upsert, con cuántas filas faltan si se corta; REVISAR_MATCH (fichas de 30 días) y ' +
             RDV_HOJA_HISTORICO + ' (intermedia)');
  return completarHistorial();
}

/** PASO 22, en seco: lo mismo sin tocar el destino (escribe sólo las solapas de la intermedia). */
function paso22_completarHistorial_enSeco() {
  _anunciar_('paso 22 — completar el historial (EN SECO)', 'completarHistorialEnSeco()  [20_UpsertDestino.js]',
             'NO escribe el destino; sí REVISAR_MATCH y ' + RDV_HOJA_HISTORICO + ' (intermedia)',
             'el log del upsert con lo que escribiría en todo el historial');
  return completarHistorialEnSeco();
}

// =============================================================================================
//  DERIVADAS POR SCRIPT (05/10, antes de Agenda; ESTADO 0.u). La solapa sobre la que trabajan los
//  pasos 25 a 27: primero la copia; después el real (cambiar esta constante).
// =============================================================================================
const PASO_DERIVADAS_SOLAPA = 'RVD JM-CM - ES';   // 05/10: la copia ya está hecha; ahora el real

/** PASO 25 — SÓLO LECTURA: las once derivadas por script contra lo que muestran las fórmulas. Tiene que dar 0. */
function paso25_compararDerivadas() {
  _anunciar_('paso 25 — comparar las derivadas (script contra fórmulas) en "' + PASO_DERIVADAS_SOLAPA + '"',
             'compararDerivadas()  [30_Derivadas.js]', 'NO escribe nada',
             'el log: el texto exacto de las once fórmulas, y por columna iguales / distintas (10 primeras distintas)');
  return compararDerivadas(PASO_DERIVADAS_SOLAPA);
}

/** PASO 26 — quitar las fórmulas, EN SECO: dice qué haría (y si da 0 distintas). */
function paso26_quitarFormulasDerivadas_enSeco() {
  _anunciar_('paso 26 — quitar las fórmulas de las derivadas (EN SECO) en "' + PASO_DERIVADAS_SOLAPA + '"',
             'quitarFormulasDerivadas(solapa, false)  [30_Derivadas.js]', 'NO escribe nada',
             'el log: cuántas columnas y celdas; si hay distintas, no seguiría');
  return quitarFormulasDerivadas(PASO_DERIVADAS_SOLAPA, false);
}

/** PASO 26 — quitar las fórmulas: respaldo, fórmula → valores en la misma tanda, protección con advertencia. */
function paso26_quitarFormulasDerivadas() {
  _anunciar_('paso 26 — QUITAR las fórmulas de las derivadas en "' + PASO_DERIVADAS_SOLAPA + '"',
             'quitarFormulasDerivadas(solapa, true)  [30_Derivadas.js]',
             'con DRY_RUN = false, SÍ: guarda el respaldo en ' + RDV_HOJA_RESPALDO_DERIVADAS + ', cambia las once fórmulas por ' +
             'sus valores (sólo si da 0 distintas) y las protege con advertencia', 'el log: quitadas, y la verificación (0 distintas)');
  return quitarFormulasDerivadas(PASO_DERIVADAS_SOLAPA, true);
}

/** PASO 26b — recalcular las derivadas por script a mano (lo que hace el upsert al final de cada corrida). */
function paso26_recalcularDerivadas() {
  _anunciar_('paso 26b — recalcular las derivadas en "' + PASO_DERIVADAS_SOLAPA + '"',
             'recalcularDerivadas(solapa, true)  [30_Derivadas.js]',
             'con DRY_RUN = false, SÍ: sobrescribe sólo las celdas de las once que cambiaron (las que no tienen fórmula)',
             'el log: celdas que cambian, por columna');
  return recalcularDerivadas(PASO_DERIVADAS_SOLAPA, true);
}

/** PASO 26c — el paso 14 sobre la solapa de las derivadas: "valores = Comunas" con o sin fórmula. */
function paso26_formulasDerivadas() {
  _anunciar_('paso 26c — paso 14 sobre "' + PASO_DERIVADAS_SOLAPA + '"', 'diagFormulasDestino(solapa)  [diagnostico/07_formulas_destino.js]',
             'NO escribe nada', 'el log: fórmula o "por script" de cada una, valores contra Comunas y las de la fila contra el script');
  return diagFormulasDestino(PASO_DERIVADAS_SOLAPA);
}

/** PASO 27 — volver atrás, EN SECO: lista las fórmulas del respaldo que pondría. */
function paso27_restaurarFormulasDerivadas_enSeco() {
  _anunciar_('paso 27 — restaurar las fórmulas (EN SECO) en "' + PASO_DERIVADAS_SOLAPA + '"',
             'restaurarFormulasDerivadas(solapa, false)  [30_Derivadas.js]', 'NO escribe nada', 'el log: las fórmulas del respaldo');
  return restaurarFormulasDerivadas(PASO_DERIVADAS_SOLAPA, false);
}

/** PASO 27 — volver atrás: borra los valores de las once y pone las fórmulas del respaldo. */
function paso27_restaurarFormulasDerivadas() {
  _anunciar_('paso 27 — RESTAURAR las fórmulas en "' + PASO_DERIVADAS_SOLAPA + '"',
             'restaurarFormulasDerivadas(solapa, true)  [30_Derivadas.js]',
             'con DRY_RUN = false, SÍ: borra los valores de las once columnas y pone las fórmulas de ' + RDV_HOJA_RESPALDO_DERIVADAS,
             'el log: cuántas restauró. Después, DERIVADAS_POR_SCRIPT = false');
  return restaurarFormulasDerivadas(PASO_DERIVADAS_SOLAPA, true);
}

/**
 * PASO 2b — la calibración sobre TODO el historial (03/10): el upsert trabaja sólo sobre las filas
 * activas (DIAS_ACTIVOS); los bloques de calibración se leen sobre la ventana de análisis. Sólo log.
 */
function paso2b_calibrarHistorial() {
  _anunciar_('paso 2b — calibración sobre todo el historial', 'calibrarHistorial()  [20_UpsertDestino.js]',
             'NO escribe en ninguna planilla (ni los reportes)', 'sólo el log de siempre del paso 2, con todas las filas');
  return calibrarHistorial();
}

/* PASO 19 — el #4F81BD viejo pasa al color nuevo del sistema (#CFE2F3). En seco primero. */
function paso19_repintarAzulViejo_enSeco() {
  _anunciar_('paso 19 — repintar el azul viejo (EN SECO)', 'repintarAzulViejo(false)  [diagnostico/11_repintar.js]',
             'NO escribe nada', 'el log: cuántas celdas hay en #4F81BD, por columna');
  return repintarAzulViejo(false);
}

function paso19_repintarAzulViejo() {
  _anunciar_('paso 19 — repintar el azul viejo', 'repintarAzulViejo(true)  [diagnostico/11_repintar.js]',
             'con DRY_RUN = false, SÍ: cambia el fondo #4F81BD por COLOR_SISTEMA en el destino, sin tocar valores',
             'el log: por columna, y cuántas repintó');
  return repintarAzulViejo(true);
}

// =============================================================================================
//  FASE 7 — los activadores (04/10).
//    paso 23: listar los instalados y marcar los del legado a BORRAR (sólo lectura).
//    paso 24: instalar el del upsert, cada 1 hora. LISTO, NO INSTALADO: lo corre el usuario cuando
//             confirme que el legado está apagado (se niega si el paso 23 marca alguno a BORRAR).
//  Después de instalarlo: anotarlo en docs/triggers-legado.md (fecha, dueño). Ver 99_Pipeline.js.
// =============================================================================================
function paso23_listarActivadores() {
  _anunciar_('paso 23 — listar los activadores', 'listarActivadores()  [diagnostico/14_activadores.js]',
             'NO: sólo lee (no borra ni crea nada)',
             'el log: cada activador con BORRAR / MANTENER / NUEVO / DESCONOCIDO, y el resumen');
  return listarActivadores();
}

function paso24_instalarActivadorCadaHora() {
  _anunciar_('paso 24 — instalar el activador (cada ' + ACTIVADOR_CADA_HORAS + ' hora)', 'instalarActivadorDiario_()  [99_Pipeline.js]',
             'crea UN activador de tiempo que llama a ' + ACTIVADOR_DIARIO_FUNCION + ' cada ' + ACTIVADOR_CADA_HORAS +
             ' hora; se niega si el destino no es el real o si queda un activador del legado',
             'el log dice si lo creó o si ya existía');
  return instalarActivadorDiario_();
}

function paso24_borrarActivadorCadaHora() {
  _anunciar_('paso 24 — borrar el activador del upsert', 'borrarActivadorDiario_()  [99_Pipeline.js]',
             'borra los activadores que llaman a ' + ACTIVADOR_DIARIO_FUNCION + '; ningún otro',
             'el log dice cuántos borró');
  return borrarActivadorDiario_();
}

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
  Logger.log('  destino ....... %s  (RDV_HOJA_DESTINO, 00_Config.js)', descripcionHojaDestino_());
}

function _anunciarDiag_(llama, salida) {
  _anunciar_('diagnóstico ya corrido, rehaciéndolo', llama, 'NO en el destino (sólo lectura)',
             salida + ' en la intermedia');
}
