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
 *  >>> 09/10 (4): dos mejoras del cruce de los IDs, escritas y APAGADAS (IDS_CONJUNTA_UNA_FIGURA, IDS_SEGURIDAD_POR_COMUNA):
 *        paso60_medirIdsMejoras()   SÓLO LECTURA: cuántos de IDS_SIN_CRUZAR resuelve cada una; "CAMBIA UN ID YA CRUZADO" = 0
 *      Si está bien: el interruptor = true + clasp push; los viejos, paso57_idsHistorial() otra vez (sólo celdas vacías).
 *  >>> 09/10 (3): IDS_EN_LA_HORA = true (pasos 55 a 57 OK: 733 cruzan, conflictos 0). Nada para correr a mano: la corrida de la
 *      hora completa los IDs de las filas activas que ya pasaron; mirar la columna "ids" de REGISTRO_UPSERT.
 *  >>> 09/10 (2): EL GUARDIÁN de las columnas del sistema (46_Guardian.js), escrito y APAGADO (GUARDIAN_ACTIVO = false):
 *        paso58_guardianEnSeco()     SÓLO LECTURA: qué ocultaría, protegería y restauraría; la prueba de la desalineación;
 *                                    las filas que no cuadran hoy
 *        paso59_guardianPreparar()   ESCRIBE FORMATO: oculta, protege con advertencia, encabezado gris; la primera copia
 *      Después: GUARDIAN_ACTIVO = true + clasp push, y paso48_ayuda() (la GUÍA con "las columnas grises"). ESTADO 0.z.
 *  >>> 09/10, A LA MAÑANA: correr **manana()** (abajo, junto a los pasos 55-57). SÓLO LECTURA: no escribe nada. Corre la
 *      medición de los IDs (paso 55: el cruce, el caso 3735 → 805) y las del guardián (las filas cuyas trazas no cuadran hoy
 *      y la prueba del orden parcial, en memoria) y el inventario de las columnas del sistema (ocultas/protegidas), y termina
 *      con un RESUMEN de qué está listo para prender. El texto del guardián NO llegó: sus reglas no están hechas (ESTADO 0.z).
 *      Todo lo nuevo sigue APAGADO: la corrida de la hora hace lo mismo que el 08/10.
 *  >>> 08/10 (7): LOS IDS DE LOS ENCUENTROS ("ID cuentas" y "Fecha envío campañas", 45_IdsCuentas.js), escritos y
 *      APAGADOS en la hora (IDS_EN_LA_HORA = false). En orden, de a uno:
 *        paso55_medirIds()             SÓLO LECTURA: el cruce por solapa, fecha distinta, el caso 3735 → 805, lo que no se
 *                                      cruza, las fechas de envío, las filas sin ID por mes y figura
 *        paso56_idsHistorial_enSeco()  no toca la base; escribe IDS_SIN_CRUZAR (intermedia)
 *        paso57_idsHistorial()         ESCRIBE una vez: agrega las dos columnas al final si faltan; sólo celdas vacías
 *      Después: IDS_EN_LA_HORA = true + clasp push (la corrida de la hora, después de la agenda). Predicción: ESTADO 0.z.
 *  >>> 08/10 (6): LOOKER_EN_SISTEMA = true (pruebasLooker de las 19:00, aprobado). El script atado, VACÍO desde las 21:22:
 *      Migrado.js (las dos funciones vacías) y LEGACY.js (todo comentado), subidos desde script-atado-base/ (al lado del
 *      repo); sus activadores los borró el usuario. Después de la primera corrida de la hora:
 *      REGISTRO_UPSERT (columna "looker": "reuniones 795"), Datos_Unpivot (FechaCarga nueva) y paso53_investigarId() (la ID
 *      nueva, sin "GMT" ni repetidas). Lista completa en ESTADO 0.z.
 *  >>> 08/10 (5): FASE 2 del tablero de Looker, escrita y APAGADA (LOOKER_EN_SISTEMA = false). SÓLO LECTURA:
 *        pruebasLooker()  = paso54a_pruebaLookerBackup() → paso54b_pruebaLookerHoy() → paso54c_pruebaLookerCorregido()
 *      A y B: IDÉNTICO (B, salvo lo que cambió RVD después de la última corrida del script atado); C: OTRA = 0. Si está bien:
 *      LOOKER_EN_SISTEMA = true + clasp push, y A LA VEZ el script atado con las funciones vacías (docs/script-looker.md).
 *  >>> 08/10 (4): FICHAS_0810_ACTIVAS = true (paso 52 de las 17:09: escritura 0; y las opciones de OTRA figura que ya
 *      tienen su fila, fuera). Nada para correr a mano: la próxima corrida de la hora regenera REVISAR_MATCH.
 *  >>> 08/10 (3): SÓLO LECTURA, para la FASE 2 del script de Looker: paso53_investigarId() (la columna ID: formatos y quién
 *      escribió los que cambiaron desde el 04/10).
 *  >>> 08/10 (2): las fichas con "esperando formulario" y las opciones cercanas, escritas y APAGADAS
 *      (FICHAS_0810_ACTIVAS = false). Correr paso52_medirFichas() (SÓLO LECTURA: qué fichas salen, entran o cambian de
 *      opciones; la escritura tiene que dar 0 diferencias). Si está bien: FICHAS_0810_ACTIVAS = true + clasp push.
 *  >>> 08/10: CAMBIOS_0710_ACTIVOS = true (el paso 51 de las 00:02 coincidió con la predicción). La corrida de la hora
 *      escribe 815–819 como mostró el paso 51; nada para correr a mano. Para mirar después: la 815 (Barrio Villa Crespo,
 *      formulario de la conjunta, 20) y el log ("de los próximos 7 días se cruzaron …", "conjuntas", "nota del eje").
 *  >>> 07/10 (16): UBICACION_TRES_NIVELES = true (medir07: CAMBIA 0). La TANDA DEL 07/10 (puntos 2 a 5: barrio con el eje
 *      del mail, pendiente_barrio sin ubicación, futuras a 7 días, conjuntas) está escrita y APAGADA
 *      (CAMBIOS_0710_ACTIVOS = false): la corrida de la hora no la aplica. Correr paso51_previsualizarFilas() (SÓLO
 *      LECTURA: qué escribiría en 815–827 con la tanda prendida; predicción en ESTADO 0.z). Si coincide:
 *      CAMBIOS_0710_ACTIVOS = true + clasp push.
 *  >>> 07/10 (15): SÓLO LECTURA, antes de prender nada (predicción en ESTADO 0.z, "La ubicación en tres niveles"):
 *        medir07()  = paso49_medirUbicacion() → paso49b_medirUbicacionAgenda() → paso50_columnaId()
 *      (si se pasa de los 6 minutos, uno por uno). UBICACION_TRES_NIVELES sigue en false hasta ver CAMBIA 0.
 *      La protección (bug "addEditor … isWarningOnly"): REVISAR_MATCH y AGENDA_DUPLICADOS quedan con la protección REAL en
 *      la próxima corrida de la hora; GUÍA y LEER, volviendo a correr paso48_ayuda().
 *  >>> 07/10 (14): el backup de la BASE (RDV_SS_BACKUP_BASE; el anterior era una copia de la intermedia). Correr
 *      limpiar24() (o sus pasos uno por uno): paso 18 → 47 en seco → 47 → 47b en seco → 47b → paso 18. Predicción en ESTADO.
 *  >>> 07/10 (13): solapas de AYUDA: paso48_ayuda_enSeco() → paso48_ayuda()  ("GUÍA" en la base, "LEER" en "Agenda").
 *  >>> 07/10 (12): las 24 celdas de Sin identificar mal escritas (filas 372–403, cerradas; paso 18). EN ORDEN:
 *        0. el backup de la BASE (RDV_SS_BACKUP_BASE, 04/10 antes de las 00:20; el anterior era de la intermedia): el
 *           paso 18 confirma archivo, solapa y filas al leerlo; sin él no se vacía nada → paso18_malEscritas_listar()
 *        1. paso47_revisarDesagregado_enSeco() → mirar la lista → paso47_revisarDesagregado()
 *        2. paso47b_completarFilasRevisadas_enSeco() → paso47b_completarFilasRevisadas()   (sólo esas filas; el paso 22
 *           entero también sirve, pero completaría cualquier otra celda vacía del historial)
 *        3. paso18_malEscritas_listar() → tiene que dar 0
 *  >>> 07/10 (11): CORRECCIÓN: Sin identificar NO cambió (sigue siendo el resto de las EDADES). Correr
 *      paso18_malEscritas_listar() (en seco): si lista celdas, alguna corrida escribió con la fórmula equivocada →
 *      paso18_malEscritas_vaciarReal(). Y paso46_chequearColumnasB() (sólo lectura).
 *  >>> 07/10 (10): B CAMBIÓ DE COLUMNAS: mapeo nuevo (COLUMNAS_B / MAPEO_CANALES), protección (columnas de B que faltan
 *      o sin mapear, o formularios que no cierran → no se escriben esos datos).
 *      Correr paso46_chequearColumnasB() (sólo lectura) ANTES de la corrida de la hora (ESTADO 0.z).
 *  >>> 07/10 (9): CRUCE_CONJUNTO_POR_DIRECCION = true (paso 45: exacta 88,7% + parecida 6,6%, CAMBIA 0). El archivo
 *      "Agenda" en dos solapas: "Agenda" (la semana en curso) y "Agenda cerrada" (las que terminaron).
 *  >>> 07/10 (8): la DIRECCIÓN en el cruce con RDV CONJUNTO (figura de Seguridad; desempate de Asistentes/oradores),
 *      detrás de CRUCE_CONJUNTO_POR_DIRECCION = false. Primero paso45_medirDireccionConjunto() (sólo lectura): CAMBIA
 *      tiene que dar 0; si da 0 y los RESUELVE son correctos → CRUCE_CONJUNTO_POR_DIRECCION = true + clasp push.
 *  >>> 07/10 (7): "ya cargada en otra fila" (caso Macri 01/10 ↔ 805; ESTADO 0.z): no crea ni pregunta. Correr
 *      paso44_medirYaCargadas() (sólo lectura): "contradice" tiene que dar 0.
 *  >>> 07/10 (6): LA AGENDA EN AUTOMÁTICO (AGENDA_ACTIVA = true): corre en upsertDiario, cada hora, ANTES del cruce con
 *      los formularios; si falla, queda en el log y en REGISTRO_AGENDA y el upsert sigue. Qué mirar los primeros días:
 *      ESTADO 0.z, "La agenda en automático". Confirmar que el activador está instalado: paso23_listarActivadores().
 *      Para apagarla: AGENDA_ACTIVA = false + clasp push. Para deshacer una corrida: paso38_deshacerAgenda_enSeco() → paso38.
 *  >>> 07/10 (5): semana() de las 13:35 OK. Ajustes (ESTADO 0.z): el color heredado de las 16 columnas, un "Re:" sólo
 *      agrega o actualiza, la cancelación se PREGUNTA (AGENDA_CANCELACION_AUTOMATICA = false). AGENDA_SOLO_SEMANA = null.
 *        1. paso43_limpiarFondoAgenda_enSeco() → paso43_limpiarFondoAgenda()   (el fondo de las celdas vacías)
 *        2. paso42_medirRespuestas()   (sólo lectura: cuántas desaparecidas cambian con la regla del "Re:")
 *        3. paso37_agenda_enSeco()     (todo el alcance; predicción en ESTADO 0.z) → paso16_verificarEscritura()
 *  >>> 07/10 (4): después de semana() (11:52): versión como texto, formato de la traza, "Re:"/"Fwd:" sin el texto
 *      citado, una línea por reunión en "Agenda", "Conjunta con" igual en los dos lados (ESTADO 0.z). Lo próximo:
 *        1. paso37_agenda_enSeco()  (la semana) → CREAR 0, SUSPENDER 0, BORRAR 0 (si no, NO seguir)
 *        2. semana()  → corrige las filas 812–820
 *        3. AGENDA_SOLO_SEMANA = null, clasp push → paso37_agenda_enSeco()  (predicción en ESTADO 0.z)
 *  >>> 07/10 (3): AGENDA, AJUSTES DEL EQUIPO antes de la primera corrida real (prompt 07; ESTADO 0.z, "Ajustes del
 *      equipo"): "Origen fila", "Tocado por el equipo", las columnas "(mail)", AGENDA_DUPLICADOS, la fila borrada por el
 *      equipo no se recrea. Lo próximo, con la predicción escrita en ESTADO:
 *        1. paso41_medirFormatoEquipo()  (sólo lectura) → ajustar AGENDA_DIRECCION_FORMA / _EVENTO_CON_EJE / _HORA_AJUSTE_MIN
 *        2. semana()  (con AGENDA_SOLO_SEMANA = '2026-10-05'): columnas (16 al final) → la agenda REAL → paso 16
 *      Para volver atrás: paso38_deshacerAgenda_enSeco() → paso38_deshacerAgenda().
 *  >>> 06/10: REVISAR_MATCH con el FORMATO APROBADO (docs/revisar-match-ficha-tecnica.md), PRENDIDO
 *      (REVISAR_FORMATO_NUEVO = true) después de los pasos 33 y 34. Falta: upsertDestino() una vez → la solapa del equipo
 *      pasa al formato nuevo, conservando ELEGIR y COMENTARIO.
 *  >>> 07/10 (2): la corrida de todas() del 06/10 23:10 (ESTADO 0.z): duplicado entre grupos arreglado; la intermedia:
 *      paso39_limpiarIntermedia_enSeco() → paso39_limpiarIntermedia() → todas() (con AGENDA_SOLO_SEMANA = '2026-10-05').
 *      Si REGISTRO_AGENDA vuelve a fallar: paso40_archivoRegistros() y poner el ID en RDV_SS_REGISTROS.
 *  >>> 07/10: AGENDA, ETAPA 2 — ajustes de la corrida de todas() del 06/10 22:33 (ESTADO 0.z, "Ajustes"): Gmail por
 *      etiqueta O asunto, la intermedia con reintentos y REGISTRO obligatorio, EVENTO como el equipo, BORRAR la fila
 *      creada y sin tocar (regla 7), paso39_medirIntermedia(). Lo próximo: todas() con AGENDA_SOLO_SEMANA = '2026-10-05'.
 *  >>> 06/10 noche: AGENDA, ETAPA 2 — crear y actualizar filas del destino (ESTADO 0.z; prompt 06). La copia de prueba
 *      ya no existe: todo va sobre el real, con estas protecciones. Predicción de cada paso en ESTADO 0.z:
 *        1. ponerle NOMBRE a la versión del archivo del destino (Archivo → Historial de versiones)
 *        2. paso35_medirReglaBarrio()  y  paso35b_medirDesaparecidas()   (sólo lectura) → aprobar el margen
 *        3. paso36_columnasAgenda_enSeco() → paso36_columnasAgenda()      (9 encabezados al final)
 *        4. AGENDA_SOLO_SEMANA = el lunes de la semana en curso (00_Config.js) → paso37_agenda_enSeco()
 *        5. paso37_agenda()  (real, esa semana) → paso16_verificarEscritura() → mirar las filas y el archivo "Agenda"
 *        6. AGENDA_SOLO_SEMANA = null: paso37_agenda_enSeco() → paso37_agenda() → paso16_verificarEscritura()
 *        7. AGENDA_ACTIVA = true (entra al activador de cada hora)
 *      Para volver atrás: paso38_deshacerAgenda_enSeco() → paso38_deshacerAgenda().
 *  >>> 06/10 tarde: AGENDA, ETAPA 1 — SEGUNDA CORRIDA, con los ajustes (fecha fuera de semana, asuntos, tipos,
 *      regla de confianza del barrio; ESTADO 0.x, predicción escrita): paso29 → paso30 → paso31 (mide la regla).
 *  >>> 06/10: AGENDA, ETAPA 1 — MEDIR (ESTADO 0.x; todo sólo lectura sobre el destino; predicciones en ESTADO):
 *      rehacer_diagMuestrasMail() si DIAG_MAILS tiene más de una semana → paso29_parsearAgendaMails() →
 *      paso30_cruzarAgendaConDestino() → paso31_barrioDesdeDireccion() (repetir hasta 0 pendientes) →
 *      paso32_seguridadContraConjunto().
 *  >>> 06/10: las FICHAS se mueven al ARCHIVO del destino (ESTADO 0.w): upsertDestino() a mano (pide autorizar
 *      de nuevo: Session) → solapa REVISAR_MATCH en el destino, ELEGIR y COMENTARIO adelante y únicos editables.
 *  >>> 06/10: oradores desde RDV CONJUNTO (ESTADO 0.v): paso28_medirOradores() (sólo lectura) →
 *      paso22_completarHistorial() → paso16_verificarEscritura() → paso20_porQueVacia().
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
 *        1. (paso18 sobre la copia: ya no existe, ni la copia)
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
             'NO escribe en ninguna planilla (lee el destino, B y el backup de la base)',
             'sólo el log: por solapa, cada celda mal escrita con el valor escrito y el correcto');
  return listarMalEscritas();
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

/** PASO 25 — SÓLO LECTURA: las once derivadas por script contra lo que muestran las fórmulas. Tiene que dar 0. */
function paso25_compararDerivadas() {
  _anunciar_('paso 25 — comparar las derivadas (script contra fórmulas) en "' + RDV_HOJA_DESTINO + '"',
             'compararDerivadas()  [30_Derivadas.js]', 'NO escribe nada',
             'el log: el texto exacto de las once fórmulas, y por columna iguales / distintas (10 primeras distintas)');
  return compararDerivadas(RDV_HOJA_DESTINO);
}

/** PASO 26 — quitar las fórmulas, EN SECO: dice qué haría (y si da 0 distintas). */
function paso26_quitarFormulasDerivadas_enSeco() {
  _anunciar_('paso 26 — quitar las fórmulas de las derivadas (EN SECO) en "' + RDV_HOJA_DESTINO + '"',
             'quitarFormulasDerivadas(solapa, false)  [30_Derivadas.js]', 'NO escribe nada',
             'el log: cuántas columnas y celdas; si hay distintas, no seguiría');
  return quitarFormulasDerivadas(RDV_HOJA_DESTINO, false);
}

/** PASO 26 — quitar las fórmulas: respaldo, fórmula → valores en la misma tanda, protección con advertencia. */
function paso26_quitarFormulasDerivadas() {
  _anunciar_('paso 26 — QUITAR las fórmulas de las derivadas en "' + RDV_HOJA_DESTINO + '"',
             'quitarFormulasDerivadas(solapa, true)  [30_Derivadas.js]',
             'con DRY_RUN = false, SÍ: guarda el respaldo en ' + RDV_HOJA_RESPALDO_DERIVADAS + ', cambia las once fórmulas por ' +
             'sus valores (sólo si da 0 distintas) y las protege con advertencia', 'el log: quitadas, y la verificación (0 distintas)');
  return quitarFormulasDerivadas(RDV_HOJA_DESTINO, true);
}

/** PASO 26b — recalcular las derivadas por script a mano (lo que hace el upsert al final de cada corrida). */
function paso26_recalcularDerivadas() {
  _anunciar_('paso 26b — recalcular las derivadas en "' + RDV_HOJA_DESTINO + '"',
             'recalcularDerivadas(solapa, true)  [30_Derivadas.js]',
             'con DRY_RUN = false, SÍ: sobrescribe sólo las celdas de las once que cambiaron (las que no tienen fórmula)',
             'el log: celdas que cambian, por columna');
  return recalcularDerivadas(RDV_HOJA_DESTINO, true);
}

/** PASO 26c — el paso 14 sobre la solapa de las derivadas: "valores = Comunas" con o sin fórmula. */
function paso26_formulasDerivadas() {
  _anunciar_('paso 26c — paso 14 sobre "' + RDV_HOJA_DESTINO + '"', 'diagFormulasDestino(solapa)  [diagnostico/07_formulas_destino.js]',
             'NO escribe nada', 'el log: fórmula o "por script" de cada una, valores contra Comunas y las de la fila contra el script');
  return diagFormulasDestino(RDV_HOJA_DESTINO);
}

/** PASO 27 — volver atrás, EN SECO: lista las fórmulas del respaldo que pondría. */
function paso27_restaurarFormulasDerivadas_enSeco() {
  _anunciar_('paso 27 — restaurar las fórmulas (EN SECO) en "' + RDV_HOJA_DESTINO + '"',
             'restaurarFormulasDerivadas(solapa, false)  [30_Derivadas.js]', 'NO escribe nada', 'el log: las fórmulas del respaldo');
  return restaurarFormulasDerivadas(RDV_HOJA_DESTINO, false);
}

/** PASO 27 — volver atrás: borra los valores de las once y pone las fórmulas del respaldo. */
function paso27_restaurarFormulasDerivadas() {
  _anunciar_('paso 27 — RESTAURAR las fórmulas en "' + RDV_HOJA_DESTINO + '"',
             'restaurarFormulasDerivadas(solapa, true)  [30_Derivadas.js]',
             'con DRY_RUN = false, SÍ: borra los valores de las once columnas y pone las fórmulas de ' + RDV_HOJA_RESPALDO_DERIVADAS,
             'el log: cuántas restauró. Después, DERIVADAS_POR_SCRIPT = false');
  return restaurarFormulasDerivadas(RDV_HOJA_DESTINO, true);
}

/**
 * PASO 28 — los oradores (06/10), SÓLO LECTURA: las dos columnas en los dos lados, el tipo de dato, y con el
 * cruce de Asistentes, por columna, cuántas se completarían, iguales y distintas. Antes del paso 22.
 */
function paso28_medirOradores() {
  _anunciar_('paso 28 — medir los oradores', 'medirOradores()  [diagnostico/15_oradores.js]', 'NO escribe nada',
             'el log: columnas y tipos (10 ejemplos), y por columna: se completaría [activas | cerradas], igual, distinto');
  return medirOradores();
}

// =============================================================================================
//  AGENDA, ETAPA 1 (06/10; ESTADO 0.x; prompt: docs/prompts/PROMPT-05-AGENDA-ETAPA1-MEDICION.md).
//  Todo SÓLO LECTURA sobre el destino: escriben solapas AGENDA_* en la intermedia. Los mails salen de
//  DIAG_MAILS (AGENDA_FUENTE_MAILS en diagnostico/16_agenda_medicion.js; 'GMAIL' para leerlos directo).
// =============================================================================================

/** PASO 29 — el parser nuevo de los mails de agenda: la última versión de cada semana + grupo, y las desaparecidas. */
function paso29_parsearAgendaMails() {
  _anunciar_('paso 29 — parsear los mails de agenda', 'parsearAgendaMails()  [diagnostico/16_agenda_medicion.js]',
             'NO toca el destino; escribe AGENDA_MAIL y AGENDA_MAIL_DESAPARECIDAS en la intermedia',
             'el log: versiones, tipos, lugar, NO PARTICIPA, conjuntas, cambios entre versiones, desaparecidas, tolerancia de nombres');
  return parsearAgendaMails();
}

/** PASO 30 — las reuniones del mail contra el destino (ventana de análisis), las filas sin reunión, y "No participa". */
function paso30_cruzarAgendaConDestino() {
  _anunciar_('paso 30 — cruzar la agenda con el destino', 'cruzarAgendaConDestino()  [diagnostico/16_agenda_medicion.js]',
             'NO toca el destino; escribe AGENDA_CRUCE y AGENDA_DESTINO_SIN_MAIL en la intermedia',
             'el log: con fila / conjuntas / reprogramadas / desaparecidas / sin explicar contra la predicción; filas sin reunión; columna "No participa"');
  return cruzarAgendaConDestino();
}

/** PASO 31 — barrio desde la dirección (geocodificador + polígonos oficiales) contra el Barrio del destino. */
function paso31_barrioDesdeDireccion() {
  _anunciar_('paso 31 — barrio desde la dirección', 'medirBarrioDesdeDireccion()  [diagnostico/16_agenda_medicion.js]',
             'NO toca el destino; escribe AGENDA_BARRIO_DIRECCION y agrega a la cache AGENDA_GEOCODE (intermedia). Usa Maps (cuota)',
             'el log: % exacto (y por estado), la REGLA DE CONFIANZA (cumplen / exacto / se escribirían), el viejo, llamadas. Si dice PENDIENTES, volver a correr');
  return medirBarrioDesdeDireccion();
}

/** PASO 32 — las reuniones sin figura ("Seguridad en tu Barrio") contra RDV CONJUNTO por fecha + barrio o comuna. */
function paso32_seguridadContraConjunto() {
  _anunciar_('paso 32 — Seguridad en tu Barrio contra RDV CONJUNTO', 'seguridadContraConjunto()  [diagnostico/16_agenda_medicion.js]',
             'NO toca el destino; escribe AGENDA_SEGURIDAD en la intermedia',
             'el log: resuelve 1 / ambiguas / sin fila, y la figura contra la del destino');
  return seguridadContraConjunto();
}

/**
 * PASO 33 — la demo del formato aprobado de REVISAR_MATCH (06/10; docs/revisar-match-ficha-tecnica.md): los 3
 * casos de la ficha técnica, en una solapa aparte de la intermedia. Para mirar la sección 9 en Sheets.
 */
function paso33_demoFormatoRevisar() {
  _anunciar_('paso 33 — demo del formato de REVISAR_MATCH', 'demoFormatoRevisar()  [diagnostico/13_fichas_prueba.js]',
             'NO toca el destino ni REVISAR_MATCH; escribe sólo la solapa "' + RDV_HOJA_REVISAR_DEMO + '" (intermedia)',
             'la solapa, con los 3 casos de ejemplo; el log dice qué mirar');
  return demoFormatoRevisar();
}

/**
 * PASO 34 — las fichas de hoy con el formato aprobado, en una solapa de prueba de la intermedia (después de
 * aprobar la demo del paso 33, y antes de prender REVISAR_FORMATO_NUEVO).
 */
function paso34_fichasFormatoDePrueba() {
  _anunciar_('paso 34 — fichas de hoy con el formato aprobado, de prueba', 'fichasFormatoDePrueba()  [diagnostico/13_fichas_prueba.js]',
             'NO escribe el destino ni REVISAR_MATCH; escribe sólo la solapa "' + RDV_HOJA_REVISAR_FORMATO_PRUEBA + '" (intermedia)',
             'la solapa; el log: fichas por motivo y los textos que el diseño no cubre (por qué / coincide largos)');
  return fichasFormatoDePrueba();
}

// =============================================================================================
//  AGENDA, ETAPA 2 (06/10; ESTADO 0.z; prompt: docs/prompts/PROMPT-06-AGENDA-ETAPA2-CREAR-ACTUALIZAR.md).
//  Escribe en el DESTINO REAL: versión con nombre antes de la primera escritura, en seco primero, una semana primero.
// =============================================================================================

/** PASO 35 — SÓLO LECTURA: la regla de confianza del barrio CON el margen de borde (BARRIO_MARGEN_M), sobre las filas del paso 31. */
function paso35_medirReglaBarrio() {
  _anunciar_('paso 35 — la regla del barrio con el margen de ' + BARRIO_MARGEN_M + ' m', 'medirBarrioDesdeDireccion()  [diagnostico/16_agenda_medicion.js]',
             'NO toca el destino; reescribe AGENDA_BARRIO_DIRECCION y agrega a la cache AGENDA_GEOCODE (intermedia)',
             'el log: el bloque "12. LA REGLA CON EL MARGEN": cumplen, exacto, las que saca el margen');
  return medirBarrioDesdeDireccion();
}

/** PASO 35b — SÓLO LECTURA: las desaparecidas (futuras o ya pasadas al desaparecer) contra el STATUS, y las reprogramaciones entre semanas. */
function paso35b_medirDesaparecidas() {
  _anunciar_('paso 35b — desaparecidas y reprogramaciones entre semanas', 'medirDesaparecidasAgenda()  [diagnostico/16_agenda_medicion.js]',
             'NO escribe en ninguna planilla', 'sólo el log');
  return medirDesaparecidasAgenda();
}

/** PASO 36 — las columnas de la agenda, EN SECO: cuáles faltan y desde qué columna irían. */
function paso36_columnasAgenda_enSeco() {
  _anunciar_('paso 36 — columnas de la agenda (EN SECO)', 'agregarColumnasAgenda(false)  [05_Escritura.js]', 'NO escribe nada',
             'el log: cuáles faltan y desde qué columna');
  return agregarColumnasAgenda(false);
}

/** PASO 36 — agrega al final del destino los encabezados de la agenda que falten (16; 07/10). Idempotente. */
function paso36_columnasAgenda() {
  _anunciar_('paso 36 — columnas de la agenda', 'agregarColumnasAgenda(true)  [05_Escritura.js]',
             'SÍ, en el destino: sólo encabezados, al final, después de form_clave', 'el log: las agregadas');
  return agregarColumnasAgenda(true);
}

/** PASO 37 — la agenda EN SECO: qué crearía, vincularía, actualizaría, movería y suspendería. */
function paso37_agenda_enSeco() {
  _anunciar_('paso 37 — la agenda (EN SECO)' + (AGENDA_SOLO_SEMANA ? ', sólo la semana del ' + AGENDA_SOLO_SEMANA : ', TODO el alcance'),
             'correrAgendaEnSeco()  [40_Agenda.js]', 'NO toca el destino ni el archivo "Agenda"; escribe REGISTRO_AGENDA, ' +
             AGENDA_SOLAPA_VIEJAS + ' y ' + AGENDA_SOLAPA_FIGURA + ' (intermedia)',
             'el log: crear / vincular / actualizar / mover / suspender / reactivar, ambiguas, editadas, EVENTO por tipo, barrio');
  return correrAgendaEnSeco();
}

/** PASO 37 — la agenda REAL (respeta DRY_RUN). */
function paso37_agenda() {
  _anunciar_('paso 37 — la agenda (REAL)' + (AGENDA_SOLO_SEMANA ? ', sólo la semana del ' + AGENDA_SOLO_SEMANA : ', TODO el alcance'),
             'correrAgendaReal()  [40_Agenda.js]',
             'SÍ: crea y actualiza filas del destino (por escribirAgendaLote_), reescribe la solapa "Agenda" del archivo Agenda, ' +
             'y deja REGISTRO_AGENDA y REGISTRO_AGENDA_CAMBIOS (para deshacer)',
             'el log: lo que escribió, por tipo y por columna');
  return correrAgendaReal();
}

/** PASO 38 — deshacer la última corrida de la agenda, EN SECO. */
function paso38_deshacerAgenda_enSeco() {
  _anunciar_('paso 38 — deshacer la agenda (EN SECO)', 'deshacerAgenda(true)  [40_Agenda.js]', 'NO escribe nada',
             'el log: qué filas sacaría (y cuáles no, porque alguien cargó algo) y cuántas celdas volvería atrás');
  return deshacerAgenda(true);
}

/** PASO 38 — deshacer la última corrida de la agenda. */
function paso38_deshacerAgenda() {
  _anunciar_('paso 38 — DESHACER la agenda', 'deshacerAgenda(false)  [40_Agenda.js]',
             'SÍ, en el destino: saca las filas creadas que siguen replicando el mail y vuelve atrás las celdas que todavía tienen ' +
             'lo que escribió la agenda. No toca el archivo "Agenda" (se regenera en la corrida siguiente)', 'el log');
  return deshacerAgenda(false);
}

/** PASO 39 — borrar las solapas de MEDICIÓN de la etapa 1 (SOLAPAS_MEDICION_ETAPA1), EN SECO. */
function paso39_limpiarIntermedia_enSeco() {
  _anunciar_('paso 39 — limpiar la intermedia (EN SECO)', 'limpiarIntermedia(SOLAPAS_MEDICION_ETAPA1, false)  [diagnostico/17_peso_intermedia.js]',
             'NO borra nada', 'el log: qué borraría y cuánto pesa');
  return limpiarIntermedia(SOLAPAS_MEDICION_ETAPA1, false, 'medición de la etapa 1');
}

/** PASO 39 — borrar las solapas de MEDICIÓN de la etapa 1. Ningún paso de producción las lee. */
function paso39_limpiarIntermedia() {
  _anunciar_('paso 39 — limpiar la intermedia', 'limpiarIntermedia(SOLAPAS_MEDICION_ETAPA1, true)  [diagnostico/17_peso_intermedia.js]',
             'SÍ: borra de la intermedia ' + SOLAPAS_MEDICION_ETAPA1.join(', ') + ' (se recuperan del historial de versiones del archivo)',
             'el log: las borradas');
  return limpiarIntermedia(SOLAPAS_MEDICION_ETAPA1, true, 'medición de la etapa 1');
}

/** PASO 39b — los restos del legado y diagnósticos viejos (SOLAPAS_LEGADO_INTERMEDIA): EN SECO. */
function paso39b_limpiarLegado_enSeco() {
  _anunciar_('paso 39b — limpiar el legado de la intermedia (EN SECO)', 'limpiarIntermedia(SOLAPAS_LEGADO_INTERMEDIA, false)',
             'NO borra nada', 'el log: qué borraría y cuánto pesa');
  return limpiarIntermedia(SOLAPAS_LEGADO_INTERMEDIA, false, 'legado y diagnósticos viejos');
}

/** PASO 39b — borrar el legado de la intermedia. Sólo con LIMPIAR_LEGADO_CONFIRMADO = true (decisión del usuario). */
function paso39b_limpiarLegado() {
  if (!LIMPIAR_LEGADO_CONFIRMADO) {
    Logger.log('>>> LIMPIAR_LEGADO_CONFIRMADO = false: no se borra nada. Revisar paso39b_limpiarLegado_enSeco() y confirmarlo en 00_Config.js.');
    return null;
  }
  _anunciar_('paso 39b — limpiar el legado de la intermedia', 'limpiarIntermedia(SOLAPAS_LEGADO_INTERMEDIA, true)',
             'SÍ: borra ' + SOLAPAS_LEGADO_INTERMEDIA.length + ' solapas de la intermedia', 'el log: las borradas');
  return limpiarIntermedia(SOLAPAS_LEGADO_INTERMEDIA, true, 'legado y diagnósticos viejos');
}

/** PASO 40 — el archivo de registros "RDV registros", EN SECO. */
function paso40_archivoRegistros_enSeco() {
  _anunciar_('paso 40 — el archivo de registros (EN SECO)', 'crearArchivoRegistros(false)', 'NO crea nada', 'el log');
  return crearArchivoRegistros(false);
}

/** PASO 40 — crea "RDV registros", copia los registros de la agenda y dice el ID para RDV_SS_REGISTROS. */
function paso40_archivoRegistros() {
  _anunciar_('paso 40 — el archivo de registros', 'crearArchivoRegistros(true)  [diagnostico/17_peso_intermedia.js]',
             'SÍ: crea un archivo nuevo en tu Drive y copia REGISTRO_AGENDA y REGISTRO_AGENDA_CAMBIOS', 'el log: el ID para 00_Config.js');
  return crearArchivoRegistros(true);
}

/** PASO 39 — SÓLO LECTURA: cuánto pesa la intermedia, por solapa, y qué se puede sacar. */
function paso39_medirIntermedia() {
  _anunciar_('paso 39 — el peso de la intermedia', 'medirIntermedia()  [diagnostico/17_peso_intermedia.js]', 'NO escribe nada',
             'el log: por solapa celdas, fórmulas y tiempo de lectura; la propuesta de qué sacar');
  return medirIntermedia();
}

/**
 * **todas()** — la escribió el usuario en el editor (06/10, al principio de 00_Config.js) y se movió acá tal cual el
 * 07/10, para que un `clasp push` no la borre (el push reemplaza el proyecto entero con lo del repo). Corre en orden
 * las mediciones y la agenda EN SECO, cada una en su try: si una falla, sigue con la próxima. No escribe el destino.
 */
function todas() {
  var pasos = [
    ['paso35_medirReglaBarrio',        paso35_medirReglaBarrio],
    ['paso35b_medirDesaparecidas',     paso35b_medirDesaparecidas],
    ['paso36_columnasAgenda_enSeco',   paso36_columnasAgenda_enSeco],
    ['paso41_medirFormatoEquipo',      paso41_medirFormatoEquipo],
    ['paso37_agenda_enSeco',           paso37_agenda_enSeco]
  ];
  var t0 = Date.now();
  Logger.log('########## todas — inicio | AGENDA_SOLO_SEMANA = ' +
             (typeof AGENDA_SOLO_SEMANA === 'undefined' ? '(no definida)' : AGENDA_SOLO_SEMANA) +
             ' | AGENDA_ACTIVA = ' +
             (typeof AGENDA_ACTIVA === 'undefined' ? '(no definida)' : AGENDA_ACTIVA));
  pasos.forEach(function (p) {
    var t = Date.now();
    Logger.log('');
    Logger.log('########## ' + p[0] + ' ##########');
    try {
      p[1]();
      Logger.log('########## ' + p[0] + ' — OK (' + Math.round((Date.now() - t) / 1000) + ' s)');
    } catch (e) {
      Logger.log('########## ' + p[0] + ' — ERROR: ' + (e && e.stack ? e.stack : e));
    }
  });
  Logger.log('');
  Logger.log('########## todas — fin (' + Math.round((Date.now() - t0) / 1000) + ' s)');
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

/** PASO 41 — SÓLO LECTURA: cómo llena el equipo Figura, Barrio, EVENTO, FECHA, HORA, Dirección y STATUS (últimos 3 meses). */
function paso41_medirFormatoEquipo() {
  _anunciar_('paso 41 — la forma del equipo', 'medirFormatoEquipo()  [diagnostico/18_formato_equipo.js]', 'NO escribe nada',
             'el log: tipo, formato, mayúsculas y 5 ejemplos por columna; Dirección, EVENTO, STATUS de las futuras, HORA contra el ' +
             'mail; y qué poner en AGENDA_DIRECCION_FORMA / AGENDA_EVENTO_CON_EJE / AGENDA_HORA_AJUSTE_MIN');
  return medirFormatoEquipo();
}

/**
 * **semana()** — la PRIMERA CORRIDA REAL de la agenda, sólo la semana de AGENDA_SOLO_SEMANA (07/10, prompt 07). En orden,
 * y se corta en el primer error: 1) las columnas de la agenda (paso 36, real: sólo encabezados al final); 2) la agenda
 * REAL (paso 37); 3) el control (paso 16). Sin AGENDA_SOLO_SEMANA no corre (para todo el alcance: paso37_agenda()).
 */
function semana() {
  if (!AGENDA_SOLO_SEMANA) {
    Logger.log('>>> semana(): AGENDA_SOLO_SEMANA = null. Poner el lunes de la semana (00_Config.js) — para todo el alcance, paso37_agenda().');
    return null;
  }
  var t0 = Date.now();
  Logger.log('########## semana — la agenda REAL, sólo la semana del %s ##########', AGENDA_SOLO_SEMANA);
  var col = paso36_columnasAgenda();
  if (col && col.error) { Logger.log('########## semana — cortada en las columnas: %s', col.error); return col; }
  var r = paso37_agenda();
  if (!r || r.error) { Logger.log('########## semana — cortada en la agenda: %s (el paso 16 no corre)', r ? r.error : 'sin resultado'); return r; }
  paso16_verificarEscritura();
  Logger.log('########## semana — fin (%s s). Para volver atrás: paso38_deshacerAgenda_enSeco() → paso38_deshacerAgenda().',
             Math.round((Date.now() - t0) / 1000));
  return r;
}

/** PASO 42 — SÓLO LECTURA: cuántas desaparecidas cambian porque un "Re:"/"RV:"/"Fwd:" ya no hace desaparecer. */
function paso42_medirRespuestas() {
  _anunciar_('paso 42 — las respuestas sólo agregan', 'medirRespuestasAgenda()  [diagnostico/16_agenda_medicion.js]', 'NO escribe nada',
             'el log: desaparecidas antes y ahora, las que dejan de serlo (con su fila y STATUS de hoy) y las que aparecen');
  return medirRespuestasAgenda();
}

/** PASO 43 — EN SECO: cuántas celdas vacías de las columnas del sistema (agenda y traza) tienen fondo; las de traza, una por una. */
function paso43_limpiarFondoAgenda_enSeco() {
  _anunciar_('paso 43 — el fondo heredado (EN SECO)', 'limpiarFondoAgendaVacias(false)  [05_Escritura.js]', 'NO escribe nada',
             'el log: cuántas celdas, por columna, y la lista de las de traza (fila y columna)');
  return limpiarFondoAgendaVacias(false);
}

/** PASO 43 — saca el fondo de las celdas VACÍAS de las columnas del sistema: agenda y traza (las que tienen valor no se tocan). */
function paso43_limpiarFondoAgenda() {
  _anunciar_('paso 43 — el fondo heredado', 'limpiarFondoAgendaVacias(true)  [05_Escritura.js]',
             'SÍ, en el destino: sólo el FONDO de las celdas vacías de las columnas de la agenda (AV..BK) y de traza (RDV_UID..form_clave)', 'el log');
  return limpiarFondoAgendaVacias(true);
}

/** PASO 44 — SÓLO LECTURA: la regla "ya cargada en otra fila" (misma figura + barrio a ±2 días, mail anterior) en el historial. */
function paso44_medirYaCargadas() {
  _anunciar_('paso 44 — "ya cargada en otra fila"', 'medirYaCargadasAgenda()  [diagnostico/16_agenda_medicion.js]', 'NO escribe nada',
             'el log: cuántas resuelve, cuántas contradicen al equipo (tiene que dar 0), cuántas se preguntarían');
  return medirYaCargadasAgenda();
}

/** PASO 45 — SÓLO LECTURA: la dirección en el cruce con RDV CONJUNTO, antes de usarla (qué cruces cambiarían). */
function paso45_medirDireccionConjunto() {
  _anunciar_('paso 45 — la dirección en el cruce con RDV CONJUNTO', 'medirDireccionConjunto()  [diagnostico/19_direccion_conjunto.js]',
             'NO escribe nada', 'el log: RDV CONJUNTO con dirección; exacta / parecida / distinta en los cruces de hoy; CAMBIA / ' +
             'RESUELVE / PIERDE con la dirección; la figura de las Seguridad');
  return medirDireccionConjunto();
}

/** PASO 46 — SÓLO LECTURA: las columnas de B (07/10, el origen cambió de columnas) y si cada formulario cierra. */
function paso46_chequearColumnasB() {
  _anunciar_('paso 46 — las columnas de B', 'chequearColumnasB()  [diagnostico/20_columnas_b.js]', 'NO escribe nada',
             'el log: columnas reconocidas / faltantes / sin mapear; los formularios de los últimos 30 días que no cierran; ' +
             '5 ejemplos de B → destino; si la corrida de la hora va a escribir los datos de B');
  return chequearColumnasB();
}

/** PASO 47 — EN SECO: las filas con Sin identificar mal escrito (paso 18), con sus edades y su sexo contra B de hoy. */
function paso47_revisarDesagregado_enSeco() {
  _anunciar_('paso 47 — Sin identificar mal escrito: edades y sexo (EN SECO)', 'revisarDesagregadoMalEscrito(false)  [diagnostico/10_mal_escritas.js]',
             'NO escribe nada', 'el log: cada fila con su caso (edades + Sin identificar / sólo Sin identificar / no se toca) y qué se vaciaría');
  return revisarDesagregadoMalEscrito(false);
}

/** PASO 47 — vacía esas celdas (sólo las del sistema, con el backup de la base) y anota las filas para el paso 47b. */
function paso47_revisarDesagregado() {
  _anunciar_('paso 47 — Sin identificar mal escrito: VACIAR', 'revisarDesagregadoMalEscrito(true)  [diagnostico/10_mal_escritas.js]',
             'SÍ, en "' + RDV_HOJA_DESTINO_REAL + '": vacía y saca el color de las celdas listadas (sólo las del sistema); sin el backup no vacía nada',
             'el log: cuántas vació y en cuántas filas');
  return revisarDesagregadoMalEscrito(true);
}

/** PASO 47b — EN SECO: qué escribiría el upsert del historial en las filas que vació el paso 47 (sólo ésas). */
function paso47b_completarFilasRevisadas_enSeco() {
  _anunciar_('paso 47b — completar las filas del paso 47 (EN SECO)', 'completarFilasRevisadas(false)  [diagnostico/10_mal_escritas.js]',
             'NO escribe nada', 'el log: por fila, las celdas que escribiría');
  return completarFilasRevisadas(false);
}

/** PASO 47b — el upsert del historial, escribiendo SÓLO en las filas que vació el paso 47 (sólo celdas vacías). */
function paso47b_completarFilasRevisadas() {
  _anunciar_('paso 47b — completar las filas del paso 47', 'completarFilasRevisadas(true)  [diagnostico/10_mal_escritas.js]',
             DRY_RUN ? 'NO (DRY_RUN = true)' : 'SÍ, en "' + RDV_HOJA_DESTINO + '": sólo celdas vacías de esas filas, en ' + COLOR_SISTEMA,
             'el log del upsert; REGISTRO_UPSERT con alcance "historial, sólo N filas (paso 47b)"');
  return completarFilasRevisadas(true);
}

/** PASO 48 — EN SECO: las solapas de ayuda ("GUÍA" en la base RDV, "LEER" en el archivo "Agenda"): qué escribiría. */
function paso48_ayuda_enSeco() {
  _anunciar_('paso 48 — solapas de ayuda (EN SECO)', 'escribirSolapasAyuda(false)  [43_Ayuda.js]', 'NO escribe nada',
             'el log: el texto de cada solapa y si existe o se crea');
  return escribirSolapasAyuda(false);
}

/** PASO 48 — escribe (o reescribe) "GUÍA" en el archivo del destino y "LEER" en el archivo "Agenda", con formato y protegidas. */
function paso48_ayuda() {
  _anunciar_('paso 48 — solapas de ayuda', 'escribirSolapasAyuda(true)  [43_Ayuda.js]',
             'SÍ: escribe/reescribe SÓLO las solapas "' + AYUDA_SOLAPA_GUIA + '" (base RDV) y "' + AYUDA_SOLAPA_LEER + '" (archivo "Agenda"), ' +
             'las pone primeras y las protege; ninguna otra solapa', 'el log: filas escritas y la protección');
  return escribirSolapasAyuda(true);
}

/** PASO 49 — SÓLO LECTURA: la ubicación en tres niveles (UBICACION_TRES_NIVELES), con la regla de antes y la nueva. */
function paso49_medirUbicacion() {
  _anunciar_('paso 49 — la ubicación en tres niveles (formularios, asistentes y oradores, figura de Seguridad)',
             'medirUbicacionTresNiveles()  [diagnostico/21_ubicacion.js]', 'NO escribe nada',
             'el log: CAMBIA / PIERDE / RESUELVE en cada cruce (CAMBIA y PIERDE tienen que dar 0), y las filas escritas que cambiarían');
  return medirUbicacionTresNiveles();
}

/** PASO 49b — SÓLO LECTURA: la agenda (el plan en seco) con la regla de antes y la de los tres niveles. */
function paso49b_medirUbicacionAgenda() {
  _anunciar_('paso 49b — la ubicación en tres niveles en la agenda', 'medirUbicacionAgenda()  [diagnostico/21_ubicacion.js]',
             'NO escribe nada (lee los mails; la geocodificación, de la cache)',
             'el log: acciones, casi duplicados, "ya cargadas", ambiguas y figuras a completar que cambian, una por una');
  return medirUbicacionAgenda();
}

/** PASO 50 — SÓLO LECTURA: la columna ID (la fórmula en el backup de la base, los valores rotos, 3 ejemplos antes/después). */
function paso50_columnaId() {
  _anunciar_('paso 50 — la columna ID', 'inspeccionarColumnaId()  [diagnostico/21_ubicacion.js]', 'NO escribe nada',
             'el log: la fórmula del backup (y la de hoy), cuántos ID están rotos, 3 ejemplos antes / después');
  return inspeccionarColumnaId();
}

/**
 * PASO 51 — SÓLO LECTURA: qué escribiría la corrida de la hora en las filas 815 a 827 con la tanda del 07/10 PRENDIDA
 * en memoria (barrio con eje, pendiente_barrio sin ubicación, futuras a 7 días, conjuntas). Para otro rango, cambiar los
 * dos números de la llamada.
 */
function paso51_previsualizarFilas() {
  _anunciar_('paso 51 — qué escribiría en 815–827 (con la tanda del 07/10)', 'previsualizarFilas(815, 827)  [diagnostico/22_previsualizar.js]',
             'NO escribe nada (la agenda y el cruce, en memoria; lee los mails)',
             'el log: por fila, lo de la agenda (figura, barrio), el formulario y las celdas que escribiría el upsert, Asistentes y STATUS');
  return previsualizarFilas(815, 827);
}

/**
 * **medir07()** — los tres pasos de lectura del 07/10, en orden, en una sola ejecución: 49 (la ubicación: formularios,
 * asistentes, figura de Seguridad), 49b (la agenda) y 50 (la columna ID). Ninguno escribe. Si se pasa de los 6 minutos de
 * Apps Script, correrlos uno por uno (el log de lo que alcanzó a correr queda).
 */
function medir07() {
  var pasos = [['paso49_medirUbicacion', paso49_medirUbicacion], ['paso49b_medirUbicacionAgenda', paso49b_medirUbicacionAgenda],
               ['paso50_columnaId', paso50_columnaId]];
  for (var i = 0; i < pasos.length; i++) {
    var t = Date.now();
    Logger.log('');
    Logger.log('########## ' + pasos[i][0] + ' ##########');
    try {
      pasos[i][1]();
      Logger.log('########## OK (' + Math.round((Date.now() - t) / 1000) + ' s)');
    } catch (e) {
      Logger.log('########## ERROR en ' + pasos[i][0] + ' (sigue con el próximo): ' + (e && e.stack ? e.stack : e));
    }
  }
  Logger.log('');
  Logger.log('########## medir07 — fin');
}

/**
 * PASO 52 — SÓLO LECTURA (08/10): las fichas con "esperando formulario" y las opciones cercanas (FICHAS_0810_ACTIVAS),
 * antes de prenderlas. Arma las fichas de hoy con las dos reglas apagadas y prendidas, en memoria, y lista qué fichas
 * salen, cuáles entran y cuáles cambian de opciones; y controla que no cambie ninguna celda a escribir (tiene que dar 0).
 */
function paso52_medirFichas() {
  _anunciar_('paso 52 — las fichas con "esperando formulario" y las opciones cercanas', 'medirFichasCercanas()  [diagnostico/23_fichas_cercanas.js]',
             'NO escribe nada (las fichas, en memoria, dos veces)',
             'el log: 1. escritura (tiene que dar 0) · 2. salen · 3. entran · 4. otras opciones / sin ninguna · 5. resumen');
  return medirFichasCercanas();
}

/**
 * PASO 53 — SÓLO LECTURA (08/10): la columna ID, antes de la FASE 2. Los formatos (backup del 04/10 y hoy), QUIÉN escribió
 * los que cambiaron (fórmula / script atado / paso 5 del legado / una persona), los de guiones bajos, los ID repetidos y
 * cuándo corrió por última vez el script atado (FechaCarga de Datos_Unpivot).
 */
function paso53_investigarId() {
  _anunciar_('paso 53 — la columna ID: formatos y quién la escribe', 'investigarColumnaId()  [diagnostico/24_columna_id.js]',
             'NO escribe nada', 'el log: 1. formatos · 2. los que cambiaron desde el 04/10 y qué los escribió · 3. guiones bajos · ' +
             '4. repetidos · 5. Datos_Unpivot y Aux_Maximos');
  return investigarColumnaId();
}

/**
 * PASO 54 — SÓLO LECTURA (08/10): las pruebas de la FASE 2 del tablero de Looker (44_Looker.js), antes de prender
 * LOOKER_EN_SISTEMA. A: el backup del 04/10, modo compatible, contra sus solapas (IDÉNTICO). B: hoy, modo compatible,
 * contra las solapas de hoy (IDÉNTICO, salvo lo que cambió RVD después de la última corrida del script atado). C: hoy, modo
 * corregido contra compatible (cada diferencia con su motivo; "otra" tiene que dar 0), las reuniones distintas antes y
 * después, y la ID nueva.
 */
function paso54a_pruebaLookerBackup() {
  _anunciar_('paso 54a — prueba A del tablero de Looker (el backup)', 'pruebaLookerBackup()  [diagnostico/25_looker_pruebas.js]',
             'NO escribe nada', 'el log: Datos_Unpivot y Aux_Maximos, IDÉNTICO o las diferencias');
  return pruebaLookerBackup();
}
function paso54b_pruebaLookerHoy() {
  _anunciar_('paso 54b — prueba B del tablero de Looker (hoy, compatible)', 'pruebaLookerHoy()  [diagnostico/25_looker_pruebas.js]',
             'NO escribe nada', 'el log: IDÉNTICO o las diferencias, por fila de RVD, y las horas de las últimas corridas');
  return pruebaLookerHoy();
}
function paso54c_pruebaLookerCorregido() {
  _anunciar_('paso 54c — prueba C del tablero de Looker (corregido contra compatible)', 'pruebaLookerCorregido()  [diagnostico/25_looker_pruebas.js]',
             'NO escribe nada', 'el log: cada diferencia con su motivo (OTRA = 0), reuniones distintas antes y después, la ID nueva');
  return pruebaLookerCorregido();
}

/** **pruebasLooker()** — las tres pruebas del paso 54 en una sola ejecución (A, B y C). Ninguna escribe. */
function pruebasLooker() {
  var pasos = [['paso54a_pruebaLookerBackup', paso54a_pruebaLookerBackup], ['paso54b_pruebaLookerHoy', paso54b_pruebaLookerHoy],
               ['paso54c_pruebaLookerCorregido', paso54c_pruebaLookerCorregido]];
  for (var i = 0; i < pasos.length; i++) {
    var t = Date.now();
    Logger.log('');
    Logger.log('########## ' + pasos[i][0] + ' ##########');
    try {
      pasos[i][1]();
      Logger.log('########## OK (' + Math.round((Date.now() - t) / 1000) + ' s)');
    } catch (e) {
      Logger.log('########## ERROR en ' + pasos[i][0] + ' (sigue con el próximo): ' + (e && e.stack ? e.stack : e));
    }
  }
  Logger.log('');
  Logger.log('########## pruebasLooker — fin');
}

/**
 * PASO 55 — SÓLO LECTURA (08/10): los IDs de los encuentros (45_IdsCuentas.js), antes de escribir nada. Lee la lista
 * ("Agenda JM" y "Agenda funcionarios") y la base, corre el mismo cruce que el paso 57 y la corrida de la hora, y lo dice
 * todo en el log: por solapa, cuántos cruzan por la misma fecha y por fecha distinta (±3), ambiguos, sin fila y
 * conflictos; TODOS los de fecha distinta; el caso 3735-SEPJDGAG → fila 805; lo que no se reconoce; las fechas de envío;
 * las filas que quedarían sin ID, por mes y figura.
 */
function paso55_medirIds() {
  _anunciar_('paso 55 — los IDs de los encuentros: MEDICIÓN', 'medirIds()  [diagnostico/26_ids_cuentas.js]',
             'NO escribe nada (ni la base ni la intermedia)',
             'el log: la lista · el cruce por solapa · fecha distinta · el caso de control · lo que no se cruza · lo que no se reconoce · ' +
             'Tipo · Fecha de envío · filas sin ID por mes y figura · qué escribiría');
  return medirIds();
}

/**
 * **manana()** (08/10, para la mañana del 09/10) — TODAS las mediciones de esta noche, en orden, en UNA ejecución. NO ESCRIBE
 * NADA: ni la base, ni la intermedia, ni el archivo de la lista. Si un paso falla, lo dice y sigue con el próximo. Termina con
 * un RESUMEN de qué está listo para prender y qué no. La lógica (los pasos y el resumen) vive en diagnostico/28_manana.js.
 *   1. los IDs de los encuentros: medirIds() (paso 55) — el cruce por solapa (misma fecha / ±3 / ambiguos / sin fila /
 *      conflictos), el caso 3735 → 805, las fechas de envío, las filas sin ID, lo que escribiría el paso 57;
 *   2. el guardián (sólo lo que se mide sin su texto): las filas cuyas trazas no cuadran HOY y la prueba del orden parcial
 *      (grande y chico), en memoria;
 *   3. ocultar y proteger: qué columnas del sistema hay, cuáles están ocultas o protegidas hoy, y la propuesta.
 */
function manana() {
  _anunciar_('manana — las mediciones de la noche del 08/10, en orden', 'mananaMediciones_()  [diagnostico/28_manana.js]',
             'NO escribe nada (ni la base, ni la intermedia, ni la lista)',
             'el log: 1. IDs (paso 55, listas acotadas) · 2 y 3. el guardián y ocultar/proteger · el RESUMEN al final');
  return mananaMediciones_();
}

/** PASO 56 — EN SECO (08/10): la corrida del historial de los IDs sin tocar la base. Escribe IDS_SIN_CRUZAR (intermedia). */
function paso56_idsHistorial_enSeco() {
  _anunciar_('paso 56 — los IDs de los encuentros, el historial EN SECO', 'idsHistorial(true)  [45_IdsCuentas.js]',
             'NO toca la base; escribe IDS_SIN_CRUZAR en la intermedia',
             'el log: el cruce por solapa y "EN SECO: escribiría N IDs y M fechas de envío"; IDS_SIN_CRUZAR');
  return idsHistorial(true);
}

/**
 * PASO 57 — ESCRIBE, UNA VEZ (08/10): la corrida del historial de los IDs, sobre TODAS las filas. Agrega al final de la
 * base "ID cuentas" y "Fecha envío campañas" si no están (sólo el encabezado), y escribe por la regla general: sólo celda
 * vacía, COLOR_SISTEMA. Traza en REGISTRO_IDS; lo que no se cruzó, en IDS_SIN_CRUZAR. Después: IDS_EN_LA_HORA = true.
 */
function paso57_idsHistorial() {
  _anunciar_('paso 57 — los IDs de los encuentros, el historial (ESCRIBE)', 'idsHistorial(false)  [45_IdsCuentas.js]',
             'ESCRIBE en la base: "ID cuentas" y "Fecha envío campañas", sólo en celdas vacías (y las agrega al final si faltan)',
             'el log: el cruce y "Escritos en ...: N IDs y M fechas de envío"; REGISTRO_IDS y IDS_SIN_CRUZAR en la intermedia');
  return idsHistorial(false);
}

/**
 * PASO 60 — SÓLO LECTURA (09/10): las dos mejoras del cruce de los IDs (conjuntas sin "Conjunta con"; Seguridad por fecha +
 * comuna), apagadas: cuántos de IDS_SIN_CRUZAR resuelve cada una, uno por uno, y que ninguna cambie un ID ya cruzado.
 */
function paso60_medirIdsMejoras() {
  _anunciar_('paso 60 — las mejoras de los IDs: MEDICIÓN', 'medirIdsMejoras()  [diagnostico/26_ids_cuentas.js]', 'NO escribe nada',
             'el log: por mejora, lo que resuelve (fila y traza), lo que cambia de motivo y "CAMBIA UN ID YA CRUZADO" (tiene que dar 0)');
  return medirIdsMejoras();
}

/**
 * PASO 58 — EN SECO (09/10): el GUARDIÁN de las columnas del sistema, sin tocar nada. Qué columnas ocultaría (las técnicas),
 * cuáles protegería con advertencia (todas las del sistema) y en cuáles pondría el encabezado gris; qué restauraría contra
 * la copia (si ya hay una); la prueba EN MEMORIA de "alguien ordenó sólo las columnas del equipo" (qué reubicaría o si
 * frenaría la corrida); y las filas cuyas trazas no cuadran HOY (el guardián no las toca: la primera copia las toma así).
 */
function paso58_guardianEnSeco() {
  _anunciar_('paso 58 — el guardián EN SECO', 'guardianEnSeco()  [46_Guardian.js]', 'NO escribe nada (ni la base, ni la intermedia)',
             'el log: 1. ocultaría · 2. protegería y encabezado gris · 3. restauraría · 4. la prueba de la desalineación · 5. las filas que no cuadran hoy');
  return guardianEnSeco();
}

/**
 * PASO 59 — ESCRIBE FORMATO (09/10): oculta las columnas técnicas, protege con ADVERTENCIA todas las del sistema (no
 * bloquea ordenar ni borrar filas), pone su encabezado gris y toma la primera copia (SISTEMA_COPIA, intermedia). Ningún
 * valor ni fondo de datos cambia. Después: GUARDIAN_ACTIVO = true + clasp push, y paso48_ayuda() (la GUÍA nueva).
 */
function paso59_guardianPreparar() {
  _anunciar_('paso 59 — el guardián: ocultar, proteger y la primera copia', 'guardianPreparar()  [46_Guardian.js]',
             'ESCRIBE: oculta columnas, protecciones con advertencia, el encabezado gris de las columnas del sistema; SISTEMA_COPIA en la intermedia',
             'el log: cuántas ocultó, protegió y pintó, y la primera copia');
  return guardianPreparar();
}

/**
 * **ronda()** — los pasos de esta ronda, en orden, en una sola ejecución. La escribió el usuario en el editor (07/10) y
 * se movió acá tal cual, para que un `clasp push` no la borre. El único que escribe es paso43_limpiarFondoAgenda: SÓLO
 * saca el fondo de celdas VACÍAS de las columnas del sistema (las 16 de la agenda y, desde el 07/10, las de traza); no
 * toca valores. Los demás son de lectura o en seco. Antes: AGENDA_SOLO_SEMANA = null. Si un paso falla, se frena ahí.
 */
function ronda() {
  if (typeof AGENDA_SOLO_SEMANA !== 'undefined' && AGENDA_SOLO_SEMANA !== null) {
    Logger.log('NO CORRE: AGENDA_SOLO_SEMANA tiene que ser null (hoy: ' + AGENDA_SOLO_SEMANA + ').');
    return;
  }
  var pasos = [
    ['paso43_limpiarFondoAgenda_enSeco', paso43_limpiarFondoAgenda_enSeco],
    ['paso43_limpiarFondoAgenda (sólo fondo de celdas vacías)', paso43_limpiarFondoAgenda],
    ['paso42_medirRespuestas', paso42_medirRespuestas],
    ['paso37_agenda_enSeco (todo el alcance)', paso37_agenda_enSeco],
    ['paso16_verificarEscritura', paso16_verificarEscritura]
  ];
  var t0 = Date.now();
  for (var i = 0; i < pasos.length; i++) {
    var t = Date.now();
    Logger.log('');
    Logger.log('########## ' + pasos[i][0] + ' ##########');
    try {
      pasos[i][1]();
      Logger.log('########## OK (' + Math.round((Date.now() - t) / 1000) + ' s)');
    } catch (e) {
      Logger.log('########## ERROR — se frena acá: ' + (e && e.stack ? e.stack : e));
      return;
    }
  }
  Logger.log('');
  Logger.log('########## ronda — fin (' + Math.round((Date.now() - t0) / 1000) + ' s)');
}

/**
 * **verificar()** — corre a mano lo mismo que corre el activador de cada hora (upsertDiario: agenda + formularios +
 * asistentes/oradores + figura de Seguridad + derivadas) y después revisa el resultado. Sirve para no esperar a la
 * próxima hora. upsertDiario ESCRIBE (es el proceso normal); paso16 y paso20 sólo leen. Si un paso falla, se frena ahí.
 * La escribió el usuario en el editor (07/10) y se movió acá tal cual, para que un `clasp push` no la borre.
 */
function verificar() {
  var pasos = [
    ['upsertDiario (lo mismo que el activador)', upsertDiario],
    ['paso16_verificarEscritura', paso16_verificarEscritura],
    ['paso20_porQueVacia (filas activas)', paso20_porQueVacia]
  ];
  for (var i = 0; i < pasos.length; i++) {
    var t = Date.now();
    Logger.log('');
    Logger.log('########## ' + pasos[i][0] + ' ##########');
    try {
      pasos[i][1]();
      Logger.log('########## OK (' + Math.round((Date.now() - t) / 1000) + ' s)');
    } catch (e) {
      Logger.log('########## ERROR — se frena acá: ' + (e && e.stack ? e.stack : e));
      return;
    }
  }
  Logger.log('');
  Logger.log('########## verificar — fin');
}

/**
 * **limpiar24()** — corrige de una vez las 24 celdas viejas (filas 372–403, dic-2025/ene-2026). La escribió el usuario
 * en el editor (07/10) y se movió acá tal cual, para que un `clasp push` no la borre.
 * ANTES: el backup de la base (RDV_SS_BACKUP_BASE) tiene que poder leerse: el paso 18 lo confirma (archivo, solapa,
 * filas) o dice el error exacto. Sin el backup, los pasos 18 y 47 no vacían nada (sólo listan), así que no hay riesgo.
 * Si un paso falla, se frena ahí.
 */
function limpiar24() {
  var pasos = [
    ['paso18_malEscritas_listar (antes)',          paso18_malEscritas_listar],
    ['paso47_revisarDesagregado_enSeco',           paso47_revisarDesagregado_enSeco],
    ['paso47_revisarDesagregado (vacía)',          paso47_revisarDesagregado],
    ['paso47b_completarFilasRevisadas_enSeco',     paso47b_completarFilasRevisadas_enSeco],
    ['paso47b_completarFilasRevisadas (reescribe)', paso47b_completarFilasRevisadas],
    ['paso18_malEscritas_listar (después: tiene que dar 0)', paso18_malEscritas_listar]
  ];
  for (var i = 0; i < pasos.length; i++) {
    var t = Date.now();
    Logger.log('');
    Logger.log('########## ' + pasos[i][0] + ' ##########');
    try {
      pasos[i][1]();
      Logger.log('########## OK (' + Math.round((Date.now() - t) / 1000) + ' s)');
    } catch (e) {
      Logger.log('########## ERROR — se frena acá: ' + (e && e.stack ? e.stack : e));
      return;
    }
  }
  Logger.log('');
  Logger.log('########## limpiar24 — fin');
}
