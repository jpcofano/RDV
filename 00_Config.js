/**
 * 00_Config.js — el único lugar del proyecto con literales.
 *
 * **Arquitectura nueva** (CLAUDE.md 4). El pipeline legado no lo usa: lo usan `01_Utils.js`,
 * `02_Parsing.js`, `05_Escritura.js` y `40_Alertas.js`.
 *
 * Nada de acá pisa nombres del legado: el prefijo `RDV_` y los dos `COLUMNAS_*` son únicos en
 * el scope global compartido (CLAUDE.md 3.1.c).
 */

// ===================== Planillas =====================

const RDV_SS_DESTINO    = '1ZpHO6Ru1uY2r9WfBF_yFtu5z7ip7F3Q6VOoRJN5vLAo'; // (1) destino final
const RDV_SS_INTERMEDIA = '1dNLcBjh1ncEVBeALD-szhIlcRGkfOiMaPJp2tGqrsyM'; // (2) base intermedia
const RDV_SS_ORIGEN     = '1W7mzk0cTmiabfEMZ56M9pDsqf6jK6I2fDpqbpP3dWQg'; // (3) NO somos dueños
const RDV_SS_AGENDA     = '1hP8zMN8Ep7s1w9zb3Fllix2q_OqIhVwkrED0KCoVh4U'; // (4) Agenda

// --- solapas de (1), el destino ---
/**
 * La solapa que el upsert, los pasos y los diagnósticos leen y escriben como destino. **Es la única
 * referencia**: nada lleva el nombre escrito a mano. El log de cada paso dice a cuál apunta.
 *
 * Del 02/10 al 03/10 apuntó a una copia de prueba; **la copia ya no existe (06/10, la borró el usuario)**:
 * todo va sobre el destino real, con las protecciones de la etapa 2 de Agenda (versión con nombre del
 * archivo, en seco primero, una semana primero, deshacer; docs/ESTADO.md, 0.z).
 */
const RDV_HOJA_DESTINO   = 'RVD JM-CM - ES';
/** El destino real. La guarda (`verificarHojaDestino_`): si RDV_HOJA_DESTINO no es ésta, no se escribe nada. */
const RDV_HOJA_DESTINO_REAL = 'RVD JM-CM - ES';
const RDV_HOJA_ASISTENTES_SRC = 'RDV CONJUNTO'; // origen de asistentes. NO se modifica
const RDV_HOJA_COMUNAS   = 'Comunas';          // lookup barrio → comuna, A:H
const RDV_HOJA_STAGING   = 'Para Revisar';     // staging legado. Se retira en la Fase 9
const RDV_HOJA_SIN_MATCH = 'SIN_MATCH';
const RDV_HOJA_REVISAR   = 'REVISAR_MATCH';

// --- solapas de (2), la intermedia ---
const RDV_HOJA_B2       = 'B2';
const RDV_HOJA_A2       = 'A2';
const RDV_HOJA_B        = 'B';           // IMPORTRANGE del origen. Queda como vista
const RDV_HOJA_ASIST_IR = 'Asistentes';  // IMPORTRANGE de RDV CONJUNTO. Antes se llamaba 'A'
const RDV_HOJA_ALERTAS  = 'ALERTA_CAMBIOS';
const RDV_HOJA_REGISTRO = 'REGISTRO_UPSERT';   // una línea por corrida del upsert (02/10)
const RDV_HOJA_ELECCIONES = 'ELECCIONES_MATCH'; // lo que eligió una persona en "elegido" (03/10). No se borra
/** "ninguno" vence si aparece un formulario nuevo de la figura a ± estos días de la fecha de la fila. */
const VENTANA_NINGUNO_DIAS = 7;

/**
 * La línea de base de las celdas con el color del sistema (`COLORES_SISTEMA`: el actual y el viejo),
 * **por solapa**, tomada ANTES de escribir con `paso16_verificarEscritura()`. La verificación posterior
 * la usa así: las de `Barrio` —la única columna manual desde el paso B— **no pueden subir**; el total
 * es informativo. `null` = todavía no anotada.
 *
 * Antes del paso B el control era sobre las 7 columnas manuales de entonces (605 en el real y en la
 * copia, el 02/10). Con `COLUMNAS_MANUALES = ['Barrio']` ese número ya no se compara con nada: la
 * línea de base de Barrio se toma con el próximo paso 16, antes de escribir.
 */
const LINEA_BASE_AZULES = {
  // Total: 02/10 12:44 antes de la primera escritura real; 6368 después de la corrida cortada (14:50).
  // Barrio: 0, paso 16 del 04/10 00:20, antes de completar el historial (y 0 después: no puede subir).
  'RVD JM-CM - ES': { barrio: 0, total: 6368 }
};

/** Cuánto espera una corrida del upsert a que termine otra (LockService), antes de no hacer nada. */
const ESPERA_BLOQUEO_MS = 30000;

/*
 * --- La escritura en lote (02/10) ---
 * La primera escritura real (02/10 14:50) se cortó a los 6 minutos de Apps Script: escribía celda
 * por celda (leer, escribir, pintar), y cada lectura obliga a vaciar la cola de escrituras. Ahora
 * escribe por TANDAS de filas: una lectura fresca de la tanda, `setValues` por bloque y los fondos en
 * un solo `RangeList`. Y se corta sola antes del límite: lo que falta lo completa la corrida
 * siguiente (las filas ya escritas entran por RDV_UID y sólo se completan sus celdas vacías).
 */
/** Filas del destino por tanda de escritura. */
const UPSERT_FILAS_POR_TANDA = 50;
/**
 * Corte propio, medido desde que arranca la ejecución: no se empieza una tanda si con ella se pasaría
 * de acá. Deja margen para los reportes y REGISTRO_UPSERT antes de los 6 minutos de Apps Script.
 */
const UPSERT_CORTE_PROPIO_MS = 4.5 * 60 * 1000;
/**
 * Propiedad del script donde una escritura cortada deja "hasta dónde llegó" (hora, solapa, filas
 * hechas de cuántas). No es un cursor: la corrida siguiente no lo necesita para seguir —las filas ya
 * escritas entran por RDV_UID—; es para que el log lo diga. Se borra al terminar completa.
 */
const PROP_ESCRITURA_INCOMPLETA = 'UPSERT_ESCRITURA_INCOMPLETA';
/**
 * Columnas que el paso 19 (repintar el #4F81BD viejo al color nuevo) NO repinta (03/10, decisión del
 * usuario): su azul no es la marca del sistema. Por encabezado, normalizado.
 */
const COLUMNAS_NO_REPINTAR = ['Semaforo politico'];

// --- solapas de (3) y (4) ---
const RDV_HOJA_ORIGEN = 'Hoja1';   // en (3). NO somos dueños, no se modifica
const RDV_HOJA_AGENDA = 'Agenda';  // en (4)

const RDV_TZ = 'America/Argentina/Buenos_Aires';

// ===================== Columnas =====================

/**
 * Columnas que carga el equipo a mano. El pipeline **las lee y nunca las escribe, ni aunque
 * estén vacías** (CLAUDE.md, decisión 8). No es "no pisar": es no escribir.
 *
 * **Desde el 02/10 (paso B) es sólo `Barrio`.** `Inscriptos`, los cinco canales y `Asistentes`
 * pasaron a columnas del sistema: las escribe el upsert, **sólo en celda vacía**, nunca pisa un valor
 * (los errores del pasado no se corrigen). Las columnas de agenda (Figura, FECHA, HORA, Dirección,
 * EVENTO) no están acá porque el upsert no las escribe nunca: son otro proceso (pendiente).
 *
 * Ojo con la consecuencia de `Barrio`: la columna `AA (Comuna)` deriva del barrio por fórmula, así
 * que **la comuna del destino depende de carga manual**.
 */
const COLUMNAS_MANUALES = ['Barrio'];

/**
 * **El color de lo que escribe el sistema** (02/10): azul claro. Toda escritura nueva se pinta así.
 * El `#4F81BD` de antes (legado y las corridas hasta el 02/10) también se reconoce como marca del
 * sistema en todos los controles (`esColorSistema_`); `paso19_repintarAzulViejo` lo cambia por éste
 * sin tocar valores.
 */
const COLOR_SISTEMA = '#CFE2F3';
/** Los colores que cuentan como "lo escribió el sistema": el actual y el viejo. */
const COLORES_SISTEMA = [COLOR_SISTEMA, '#4F81BD'];

/**
 * Las once columnas del destino que hoy son fórmulas de array en la celda del encabezado
 * (CLAUDE.md 3.1.b y decisión 9). Bloqueadas **por nombre**: nada de `getFormula()` dinámico,
 * que no detecta las celdas expandidas de un bloque de array.
 *
 * Después de la Fase 3 la lista no se borra: cambia de significado y pasa a ser "lo que calcula
 * `recalcDerivadas_()`" (30_Derivadas.js, 05/10). La regla general (sólo celda vacía) no las escribe nunca:
 * las escribe `escribirDerivadas_` (05_Escritura.js), la excepción anunciada para las columnas del sistema.
 */
const COLUMNAS_DERIVADAS = [
  'Día de la semana', '% de Asistencia', 'Direccion2', 'Falta Informacion',
  'Comuna', 'Poblacion', 'p. Mujer', 'P. Varon', '(km2)', '(hab/km2)', 'Zona'
];

/**
 * **Las derivadas por Apps Script** (etapa "antes de Agenda", 05/10; docs/prompts/PROMPT-04-…). Con
 * `true`, el upsert (cada corrida, también el paso 22) recalcula las once COLUMNAS_DERIVADAS en TODAS las
 * filas y sobrescribe sólo donde el valor cambió, sin color (`recalcDerivadas_`, 30_Derivadas.js). Una
 * columna que todavía tiene su fórmula NO se escribe (rompería el array): se saltea y se loguea.
 * Prendido el 05/10, con la copia hecha (paso 25 en 0, fórmulas quitadas). En el real, hasta que se corra
 * el paso 26, el recálculo saltea las once y lo avisa.
 */
const DERIVADAS_POR_SCRIPT = true;
/** Lo que la fórmula de `Direccion2` le agrega a la Dirección (CLAUDE.md 3.1.b). El paso 25 lo valida. */
const SUFIJO_DIRECCION2 = ', Buenos Aires, Argentina';
/** Dónde se guarda el texto exacto de las once fórmulas antes de quitarlas (intermedia). Lo lee el paso 27. */
const RDV_HOJA_RESPALDO_DERIVADAS = 'DERIVADAS_RESPALDO';
/** La descripción de la protección (sólo advertencia) que se pone sobre las once columnas al quitar las fórmulas. */
const DESC_PROTECCION_DERIVADAS = 'RDV: columna derivada, la calcula el sistema (no editar a mano)';

// ===================== Ventana de análisis =====================

/**
 * **Todo diagnóstico se calibra sólo sobre los últimos N meses.**
 *
 * El formulario del origen cambió en **2025-10**: el barrio pasó de 0% ausente a 54%
 * (CLAUDE.md 3.3.b). Calibrar umbrales contra datos anteriores es **ajustar el sistema a un
 * origen que ya no existe** — y peor, a uno que mandaba una señal que hoy no llega, así que los
 * números saldrían optimistas.
 *
 * Los totales históricos se siguen reportando: sirven para ver el cambio. Lo que sale de la
 * ventana es **el veredicto y la calibración**.
 *
 * Se mide sobre la fecha de la reunión, contra el día de hoy.
 */
const VENTANA_ANALISIS_MESES = 6;

/**
 * **Corte fijo de la ventana**, para que dos corridas de días distintos comparen la misma
 * población. `'yyyy-MM-dd'`, o `null` para volver a la ventana móvil de
 * `VENTANA_ANALISIS_MESES` contados desde hoy.
 *
 * Existe porque la ventana móvil corre el corte todos los días: entre la corrida del 25/09 y la
 * del 26/09 pasó del 25/03 al 26/03 y la base bajó de 307 a 302 filas, y así un contador que
 * cambia puede ser población y no efecto.
 *
 * Fijado en el corte de la **línea base del 26/09 11:36** (26/03/2026). Cuando se quiera volver a
 * "los últimos 6 meses", poner `null` y decirlo en la línea base nueva.
 */
const VENTANA_ANALISIS_DESDE = '2026-03-26';

// ===================== Fechas =====================

/**
 * ⚠️ **OBSOLETA desde 2026-09-25: el ancla de fechas quedó descartada** (CLAUDE.md 3.3.c).
 * `detectFecha_` ya no la usa — toma la fecha del texto validada por la regla del mes, con
 * `fecha_fin` sólo de respaldo, y el matching la puntúa con tolerancia (`BANDAS_FECHA`). Se conserva porque `diagAnclaFecha()` la referencia como registro de la
 * medición que llevó a descartarla. **No usarla en código nuevo.**
 *
 * Ventana de aceptación de la fecha sacada del texto libre, **relativa a `fecha_fin`**, que es
 * el ancla (CLAUDE.md 3.3).
 *
 * El legado tiene la prioridad al revés ([Sync B to B2.js:162-163](Sync%20B%20to%20B2.js#L162)):
 * `detectFecha_(nombre)` va primero y `fecha_fin` queda de fallback. Como el regex casi nunca
 * falla, la columna estructurada —disponible en el 99% de las filas— prácticamente no se usa.
 *
 * Medido sobre las 1.000 filas de `B`: 743 traen fecha en el texto y el **96,1%** cae dentro de
 * ±3 días de `fecha_fin`. La moda es 0 días (444 casos) y le sigue +1 (236): la reunión es el
 * día que cierra el formulario, o el siguiente. De ahí el sesgo hacia adelante de la ventana.
 *
 * Regla: se acepta la fecha del texto **sólo si** cae en
 * `[fecha_fin + min, fecha_fin + max]`. Si no, se usa `fecha_fin` y **se marca la fila**.
 */
const VENTANA_FECHA_TEXTO = { min: -2, max: 7 };

// ===================== Match por score =====================

/**
 * Pesos del match por score (CLAUDE.md, decisión 2). Suman 1.0 con el máximo de cada señal:
 * 0.35 + 0.30 + 0.25 + 0.10.
 *
 * **El score se normaliza sobre las señales disponibles**: `obtenido / alcanzable`, donde
 * `alcanzable` es la suma de los pesos de las señales que se **pudieron evaluar** en esa fila.
 *
 * Por qué: los pesos suman 1.0 sólo con todas las señales presentes, pero el barrio ya no viene
 * nunca y la hora casi nunca, así que **1.0 es inalcanzable por construcción para el caso
 * normal**. Una fila con figura, fecha exacta y comuna coincidente acertó todo lo que había
 * para acertar y tiene que puntuar alto, no 0.80 por campos que el origen no manda.
 *
 * Bajar el umbral tapaba el síntoma; normalizar arregla la causa. Con esto el umbral significa
 * **"qué proporción de la evidencia disponible coincide"** y deja de necesitar recalibración
 * cada vez que cambia el formulario — que es exactamente lo que ya nos pasó con el barrio.
 *
 * **Ausencia contra desacuerdo**, que no es lo mismo (CLAUDE.md 3.3.b):
 *
 *   barrio igual                               → +0.25
 *   comuna igual, con barrio ausente en origen → +0.15
 *   eje igual, sin barrio ni comuna            → +0.10   (detrás de EJE_COMO_UBICACION)
 *   ausencia (ni barrio ni comuna)             → no puntúa NI cuenta para el denominador
 *   desacuerdo (barrio, comuna o eje distintos)→ descalifica: el candidato no se escribe solo
 *
 * La ausencia de dato no puede puntuar como contradicción. El desacuerdo sí es contradicción,
 * venga del barrio o de la comuna: la distinción no es qué campo es, es ausencia contra
 * desacuerdo.
 *
 * El parcial de comuna se compara **comuna contra comuna**: la del origen sale de
 * `detectComuna_` sobre el texto libre, y la del destino de subir su barrio por la tabla
 * `Comunas`. Nunca un barrio contra una comuna.
 */
const PESOS_MATCH = {
  figura:          0.35,
  fechaExacta:     0.30,   // exacta o dentro de TOLERANCIA_REPROGRAMACION_DIAS
  fecha7Dias:      0.06,
  barrioIgual:     0.25,
  comunaSinBarrio: 0.15,
  ejeSinComuna:    0.10,   // un eje contiene varias comunas: confirma menos que una comuna
  eventoIgual:     0.25,
  hora:            0.10
};

/**
 * **El eje geográfico como cuarta vía de ubicación**, para los formularios temáticos.
 *
 *     JORGE MACRI - Encuentro Temático "Salud" Jorge Macri Eje Sur - 14/08/2026
 *
 * no trae barrio ni comuna, pero `Eje Sur` **acota la geografía**. De los cuatro candidatos que
 * colgaban de ese formulario (Coghlan, Villa Santa Rita, Floresta, Villa Riachuelo), Coghlan es
 * zona norte: el eje solo lo descarta, sin ninguna otra señal.
 *
 * Es la misma señal de ubicación, en su lugar del orden **barrio → comuna → eje → evento**, y
 * con la misma asimetría que la comuna:
 *
 *   eje del formulario == eje del barrio del destino  → +0.10
 *   eje del formulario != eje del barrio del destino  → DESCALIFICA, como comuna_distinta
 *   no se sabe el eje de alguno de los dos             → no puntúa ni cuenta al denominador
 *
 * El eje del destino sale de **subir su barrio** por la tabla `Comunas`, columna **`Eje
 * geográfico`** (`COMUNAS_COL_EJE`, la I). Nunca se deduce el barrio del eje.
 *
 * ### El mapeo (desde el 29/09) y por qué sigue APAGADO
 *
 * La `Zona` de la columna H **no era el eje** (no tiene `Oeste`; encendido con ella se descartaba
 * el 82,5% de los pares de la ventana, 25/09). El equipo armó el mapeo en la columna I: **18
 * barrios los definió el equipo, 30 se completaron por comuna** (cada uno toma el eje de los
 * barrios de su comuna que definió el equipo). **12 están pendientes**, con el valor terminado en
 * `?` (`Oeste?`): Villa Crespo; la Comuna 10 entera (Floresta, Monte Castro, Vélez Sarsfield,
 * Versalles, Villa Luro, Villa Real); Liniers; Monserrat, San Telmo, Puerto Madero y Constitución.
 *
 * **Un valor con `?` es eje NO evaluable**, igual que vacío: no puntúa ni descalifica. Cuando el
 * equipo confirma uno, borra el `?` en la celda y el código lo toma solo.
 *
 * ### 🔴 DECISIÓN (30/09): queda APAGADO. No es un pendiente.
 *
 * Con la columna I el 2e dio "descartaría 66,4%" (antes 82,5%), pero ese porcentaje cuenta todos
 * los pares figura + fecha ±21, que en su mayoría no son la reunión correcta. Mirando cada
 * temático contra su fila a 0-1 días, **el eje descartaría matches CORRECTOS**:
 *
 *   fila 645, Macri 16/06 Almagro (Centro)  ← "Temático Educación - Eje Oeste": el destino tiene
 *                                             498, los inscriptos de ese temático (paso 10);
 *   fila 613, Macri 28/05 Balvanera (Centro) ← "Ciudad Atractiva 28/5 - Eje Este";
 *   fila 665, Macri 25/06 Monserrat ("Este?") ← "Ciudad Atractiva / Cultura - Eje Sur", si se
 *                                             confirmara.
 *
 * **Hipótesis:** la tabla del equipo es de *sedes* donde se hacen los temáticos de cada eje, no
 * una partición barrio → eje (tiene barrios repetidos). Y el desempate por evidencia
 * (`DESEMPATE_POR_EVIDENCIA`) ya resuelve los casos que el eje venía a resolver.
 *
 * La columna I y la convención del `?` se quedan: no molestan, y si algún día se revisa, el mapeo
 * ya está. El 2e ahora mide primero **cuántas filas perderían a su ganador actual por el eje**,
 * que es la única cifra que dice si hace daño; el % de pares queda como dato secundario.
 */
const EJE_COMO_UBICACION = false;

/**
 * **Formularios sin figura, por ubicación** (la variante D-C del paso 8, implementada).
 *
 * Desde 09/2026 hay formularios que no nombran a nadie (`VÍNCULO CIUDADANO - Encuentro con
 * vecinos sobre Seguridad - Comuna X - d/m`, CLAUDE.md 3.3). Con la figura siempre en el
 * denominador no pueden pasar de 0,56. Con esto encendido, para un formulario sin figura:
 *
 *   - la figura SALE del denominador sólo si la ubicación es evaluable y coincide (barrio o
 *     comuna) Y la fecha está a ±DIAS_SIN_FIGURA_POR_UBICACION. Si no, puntúa como antes;
 *   - desempate: un formulario sin figura nunca desplaza —ni empata, ni supera, ni cuenta como
 *     rival para el margen— a un ganador que nombra la figura de la fila y llega al umbral.
 *     Contra un candidato con figura bajo el umbral compite normal. Dos sin figura empatados
 *     van a revisión, como siempre.
 *
 * Medido antes de implementar (paso 8, 26/09 16:46, ventana): recupera **12 de 14** filas
 * objetivo con **costo 0 | 0**; 1 va a revisión (Landerreche 03/09: dos `Comuna 1 Sur - 3/9`,
 * con 0 y 116 inscriptos), que es lo correcto. La traza lo dice: `form_nivel` lleva
 * `sin_figura_por_ubicacion`.
 */
const SIN_FIGURA_POR_UBICACION = true;
const DIAS_SIN_FIGURA_POR_UBICACION = 1;

/**
 * **Desempate por evidencia** (el paso 9, implementado el 30/09). Cuando el mejor candidato de una
 * fila le gana al segundo por menos de MARGEN_MINIMO, la normalización borró cuánta evidencia
 * hay detrás de cada score (el `"1 a 1"` con figura + fecha exacta + comuna contra un temático
 * con figura + fecha a 1 día y sin ubicación: los dos dan 1,0). Orden, en `evaluarCandidatos_`:
 *
 *   1) más señales evaluadas y coincidentes (la fecha cuenta sólo si es plena, ±3)
 *   2) menor distancia en días
 *   3) más inscriptos DEL FORMULARIO (nunca los del destino: en régimen los escribe el sistema)
 *
 * Gana sólo el estrictamente mejor en el primer criterio que distinga; si empatan en los tres,
 * sigue en REVISAR_MATCH por margen_chico. El ganador tiene que llegar al umbral por sí mismo y
 * no ser multi_figura. La traza (`form_nivel`) dice por qué criterio se desempató.
 *
 * Medido antes (26/09 17:44-17:51): 39 de 39 margen_chico resueltas; contra los inscriptos del
 * destino el desempate coincide en 36 de 38 (de los 2 que no, uno lo arregla el invariante "un
 * formulario, una fila" y el otro tiene destino 0, sin dato).
 */
const DESEMPATE_POR_EVIDENCIA = true;

/** Tope de vueltas del invariante "un formulario, una fila", para que no cicle. */
const MAX_VUELTAS_FORMULARIO_UNICO = 10;

/**
 * **El eje como ÚLTIMO desempate** (30/09). Cuarto criterio de `_desempatePorEvidencia_`, después
 * de señales, distancia e inscriptos: gana el candidato cuyo eje coincide con el del barrio de la
 * fila, **sólo si exactamente uno coincide**. Eje distinto, vacío o `?` = neutro. Nunca entra al
 * score ni al margen, y nunca descalifica (eso sería `EJE_COMO_UBICACION`, que queda apagado).
 * Respeta la salvaguarda del desempate (umbral propio, no multi_figura). Traza:
 * `+desempate_por_eje`. Se espera que decida 0 filas; el log lo cuenta en una línea fija.
 */
const EJE_COMO_DESEMPATE = true;

/**
 * **Ubicación en desacuerdo con figura y fecha coincidentes → revisión, no descarte** (01/10).
 *
 * Regla de negocio 8 (CLAUDE.md 1), confirmada por el equipo: una reunión puede cambiar de lugar
 * después de creado el formulario, y entonces el título del formulario dice una comuna y RDV otra.
 * **El dato vigente es el barrio de RDV.** Un candidato que nombra la figura, está a
 * ±`DIAS_REUBICACION` días y tiene la ubicación en desacuerdo **no se descarta**:
 *   - si la fila no tiene un ganador mejor → REVISAR_MATCH con motivo `ubicacion_en_desacuerdo`
 *     ("form dice Comuna N / RDV dice Barrio (Comuna M) — posible reubicación");
 *   - el par aparece siempre en EMPAREJAR_MANUAL (no lo corta el tope);
 *   - **nunca se escribe solo.** Cuáles se podrían escribir solos lo decide el usuario con la
 *     medición `medirDesacuerdoUbicacion()` (paso 11, "sin ambigüedad").
 */
const UBICACION_DESACUERDO_A_REVISION = true;
const DIAS_REUBICACION = 1;

/**
 * **Figuras nombradas sólo por apellido** (01/10). "RDV - Eje norte, Lombardi-Tapia-Piragine- 30/3"
 * no trae ningún nombre completo. Un apellido suelto cuenta como figura **sólo si es único** entre
 * todas las figuras del destino (Lombardi → Hernán Lombardi, Tapia → Gabino Tapia, Piragine →
 * Gustavo Arengo Piragine); uno que comparten dos figuras no cuenta. Traza
 * `figura_por_apellido`. El paso 2 lista qué formularios suman figuras así, para ver que no entre
 * basura. Con 2+ figuras el formulario es multi_figura → REVISAR_MATCH, y lo decide una persona.
 */
const FIGURA_POR_APELLIDO = true;
const MIN_LARGO_APELLIDO = 4;

/**
 * **Variantes de grafía de las figuras** (01/10), portadas del legado: la tabla de regex de
 * `detectPersona_` en `_archivo/Código.js` (líneas 44-65), una por figura. Se aplican sobre el
 * texto normalizado (minúsculas, sin acentos) y **se suman** a la lista del destino: una figura
 * que el texto nombra con otra grafía cuenta igual, con traza `figura_por_variante`. El `canon`
 * se resuelve contra la columna Figura del destino (por normalización); si el destino no la
 * tiene, la variante no aporta nada. Las dos últimas son casos vistos en el 2b del 01/10.
 */
const FIGURAS_VARIANTES = [
  // --- legado: _archivo/Código.js, detectPersona_ ---
  { canon: 'Diego Kravetz',           re: /\bdiego\s+kravetz\b/ },
  { canon: 'Gabriel Mraida',          re: /\bgabriel\s+mraida\b/ },
  { canon: 'Mercedes Miguel',         re: /\bmercedes\s+miguel\b/ },
  { canon: 'Ezequiel Daglio',         re: /\bezequiel\s+daglio\b/ },
  { canon: 'Maximiliano Gallucci',    re: /\bmaximiliano\s+gallucci\b/ },
  { canon: 'Hernán Lombardi',         re: /\bhernan\s+lombardi\b/ },
  { canon: 'Jorge Macri',             re: /\bjorge\s+macri\b/ },
  { canon: 'Maximiliano Piñeiro',     re: /\bmaximiliano\s+pin(?:eiro|n?eiro)\b/ },      // Piñeiro / Pineiro
  { canon: 'Ignacio Baistrocchi',     re: /\bignacio\s+b(?:ia|ai)strocchi\b/ },          // Baistrocchi / Biastrocchi
  { canon: 'Gabino Tapia',            re: /\bgabino\s+tapia\b/ },
  { canon: 'Fernán Quirós',           re: /\bfernan\s+quiro(?:s|z)\b/ },                 // Quirós / Quiroz
  { canon: 'Laura Alonso',            re: /\blaura\s+alonso\b/ },
  { canon: 'Gustavo Arengo Piragine', re: /\bgustavo\s+arengo(?:\s+piragin[ei])?\b/ },   // con o sin "Piragine"
  { canon: 'Horacio Giménez',         re: /\bhoracio\s+gimenez\b/ },
  { canon: 'Ezequiel Sabor',          re: /\bezequiel\s+sabor\b/ },
  { canon: 'Clara Muzzio',            re: /\bclara\s+muzzio\b/ },
  { canon: 'Gabriel Sánchez Zinny',   re: /\bgabriel\s+sanchez\s+zinny\b/ },
  { canon: 'Pablo Bereciartua',       re: /\bpablo\s+bereciartua\b/ },
  { canon: 'Gabriela Ricardes',       re: /\bgabriela\s+ricardes\b/ },
  { canon: 'Ruth Landerreche',        re: /\bruth\s+lander+eche\b/ },                    // Landerreche / Landereche
  // --- vistos en el 2b del 01/10 ---
  { canon: 'Hernán Lombardi',         re: /\bhoracio\s+lombardi\b/ },                    // "Horacio Lombardi"
  { canon: 'Gustavo Arengo Piragine', re: /\barengo\s+p[ei]ragin[ei]\b/ }                // "Arengo Peragine"
];

/**
 * **Variantes de barrio** (01/10), portadas del legado: `VARIANTS` de `detectBarrio_` en
 * `_archivo/Código.js` (líneas 75-86). Entran **sólo si la lista de `Comunas` no reconoció
 * ningún barrio** en el texto, y el `canon` se resuelve contra `Comunas` (`canonizarBarrio_`).
 * Las que la normalización ya cubre (Núñez, San Cristóbal, San Nicolás, Villa Gral. Mitre, Villa
 * Pueyrredón) quedan por fidelidad al legado; las que agregan algo son las formas cortas: Vélez,
 * Paternal, Pompeya, Lugano. Se miden en una línea del paso 2.
 */
const BARRIOS_VARIANTES = [
  { canon: 'Núñez',               re: /\bnunez\b/ },
  { canon: 'Vélez Sarsfield',     re: /\bvelez(?:\s+sarsfield)?\b/ },
  { canon: 'San Cristóbal',       re: /\bsan\s+cristobal\b/ },
  { canon: 'San Nicolás',         re: /\bsan\s+nicolas\b/ },
  { canon: 'Villa General Mitre', re: /\bvilla\s+(?:general|gral\.?)\s+mitre\b/ },
  { canon: 'La Paternal',         re: /\b(?:la\s+)?paternal\b/ },
  { canon: 'Nueva Pompeya',       re: /\b(?:nueva\s+)?pompeya\b/ },
  { canon: 'Villa Pueyrredón',    re: /\bvilla\s+pueyrredon\b/ },
  { canon: 'Villa Lugano',        re: /(?:^|\s)(?:villa\s+)?lugano(?:\s|$)/ }
];

/**
 * **Ventana asimétrica para los formularios sin fecha en el texto** (01/10, decisión del usuario).
 * Esos formularios usan `fecha_fin`, el CIERRE de la inscripción, que cae antes de la reunión.
 * Medido en el paso 10 (01/10): el 100% de las reuniones confirmadas cae en o después del cierre,
 * p90 = +6. Para fuente `fecha_fin`: fecha plena si (fila − fecha_fin) está en [min, max]; **cero**
 * hacia atrás; más allá de max, la escala de siempre. Los formularios con fecha en el texto no
 * cambian (±TOLERANCIA_REPROGRAMACION_DIAS).
 */
const FECHA_FIN_ASIMETRICA = true;
const FECHA_FIN_VENTANA = { min: 0, max: 6 };

/**
 * **pendiente_barrio** (02/10, decisión del usuario). Una fila de HOY o de AYER (hasta
 * `DIAS_PENDIENTE_BARRIO` días) **sin barrio en RDV** que se escribiría o iría a revisión **no se
 * escribe**: queda con veredicto propio `pendiente_barrio` y se reevalúa en la corrida siguiente
 * (el activador corre cada hora). Los barrios se cargan a lo largo del día. Una fila sin match
 * sigue como hoy.
 */
const PENDIENTE_BARRIO_RECIENTE = true;
const DIAS_PENDIENTE_BARRIO = 1;

/** Cuántos formularios candidatos se muestran por fila en REVISAR_MATCH y EMPAREJAR_MANUAL. */
const OPCIONES_REVISION = 3;

/**
 * **Filas activas** (decisión del usuario, 03/10): el sistema trabaja sólo sobre lo relevante. Una fila
 * es activa si su FECHA está entre hoy − DIAS_ACTIVOS y hoy (las futuras siguen afuera, como siempre).
 * Lo anterior está **cerrado y no se toca**.
 *
 *   - sólo sobre filas activas: la escritura del upsert (datos, traza, STATUS, Asistentes), las fichas
 *     de REVISAR_MATCH, la lectura de "elegido", EMPAREJAR_MANUAL y el rango por defecto del paso 20.
 *     Una fila cerrada sin RDV_UID se cuenta en el log como "cerrada sin resolver";
 *   - sobre TODO el historial, sin cambios: el invariante (un formulario de una fila vieja con RDV_UID
 *     sigue ocupado), los candidatos de B (sin corte por fecha) y el invariante del paso 16 (las
 *     "incompletas" del paso 16, sólo dentro de los activos).
 *
 * Por qué alcanza (dato del usuario, 03/10): **un formulario aparece en B recién cuando cerró**, así que
 * sus números son finales y se escriben apenas hay match; no hay nada que esperar de una fila vieja.
 *
 * No es la ventana de análisis (`VENTANA_ANALISIS_*`): ésa decide sobre qué se calibra, ésta sobre qué
 * se trabaja. `null` = todas las filas (el comportamiento de antes del 03/10; lo usan los tests).
 * Las mediciones de una vez (pasos 6-13, la calibración) piden el plan con `{ historial: true }`.
 */
const DIAS_ACTIVOS = 30;

/**
 * **REVISAR_MATCH como fichas** (03/10, decisión del usuario; 26_Fichas.js): una ficha por reunión
 * pendiente, con la reunión, hasta 3 opciones en las mismas columnas, colores por celda, "¿por qué está
 * acá?", qué coincide y qué no, y "elegido" con desplegable. Validadas con `paso21_fichasDePrueba()` y
 * prendidas el 03/10. En `false`, REVISAR_MATCH vuelve al formato de una línea por fila. "elegido" se lee de los dos
 * formatos (el lector reconoce cuál es por el encabezado).
 */
const REVISAR_COMO_FICHAS = true;   // prendido el 03/10, con las fichas aprobadas (paso 21 de las 21:51)
/**
 * Lo viejo que no se resuelve solo (REVISAR_MATCH o SIN_MATCH de más de DIAS_ACTIVOS días), en la corrida
 * de completar el historial (paso 22): sólo informativa, no son fichas (intermedia).
 */
const RDV_HOJA_HISTORICO = 'HISTORICO_SIN_RESOLVER';
/**
 * **Las fichas, en el archivo del destino** (06/10, decisión del usuario): REVISAR_MATCH se escribe en una
 * solapa "REVISAR_MATCH" del archivo del destino (RDV_SS_DESTINO), donde trabaja el equipo; "elegido" y
 * "comentario" se leen de ahí. Toda la solapa protegida salvo las celdas ELEGIR y COMENTARIO de cada ficha.
 * La REVISAR_MATCH de la intermedia queda sólo con un aviso (no se lee). ELECCIONES_MATCH,
 * HISTORICO_SIN_RESOLVER y EMPAREJAR_MANUAL siguen en la intermedia. Esa solapa del destino se lee sólo por
 * su nombre: ninguna lectura del destino (RDV_HOJA_DESTINO) la toca.
 */
const SOLAPA_FICHAS_EN_DESTINO = true;
/** La descripción de la protección de la solapa de fichas del destino (se reemplaza en cada regeneración). */
const DESC_PROTECCION_FICHAS = 'RDV: fichas de revisión — sólo se escribe en ELEGIR y COMENTARIO';
/** Ancho máximo de una columna de las fichas (px): los nombres largos de formularios, con ajuste de texto. */
const FICHAS_ANCHO_MAX = 400;
/** Dónde escribe las fichas el paso 21 (vista previa, intermedia): el equipo no la mira. */
const RDV_HOJA_FICHAS_PRUEBA = 'REVISAR_FICHAS_PRUEBA';
/**
 * **REVISAR_MATCH con el formato aprobado el 06/10** (ficha técnica: docs/revisar-match-ficha-tecnica.md;
 * dibujo: 27_RevisarFormato.js; datos y auxiliares: `armarFichasFormato_` / `escribirFichasFormato_`,
 * 26_Fichas.js). Columnas A..M fijas del diseño; la identidad (id de la reunión, form_clave de cada opción),
 * en columnas auxiliares ocultas desde la N. Mismas fichas, mismas frases, mismos colores por coincidencia y
 * misma lectura de ELEGIR (por clave, nunca por posición). **Prendido el 06/10** (decisión del usuario, después
 * de correr la demo (paso 33) y la vista previa (paso 34)). En `false`, vuelve el formato de una ficha por bloque. "elegido" se lee de los
 * dos formatos.
 */
const REVISAR_FORMATO_NUEVO = true;
/** Dónde dibuja la demo del formato (paso 33) y la vista previa con datos reales (paso 34): la intermedia. */
const RDV_HOJA_REVISAR_DEMO = 'REVISAR_MATCH_DEMO';
const RDV_HOJA_REVISAR_FORMATO_PRUEBA = 'REVISAR_FORMATO_PRUEBA';
/**
 * **Los oradores** (06/10, antes de Agenda): las dos columnas que siguen a Asistentes en RDV CONJUNTO, que
 * el sistema copia al destino con el mismo cruce y las mismas reglas que Asistentes (sólo celda vacía, un 0
 * del destino es un valor, #CFE2F3; cruce no seguro → no se escribe y se lista). Se buscan por encabezado;
 * la letra es sólo un control: si en el destino no están en R y S, o en RDV CONJUNTO no son las dos
 * siguientes a Asistentes, **error y no se escribe nada**.
 */
const COLUMNAS_ORADORES = ['Oradores anotados', 'Oradores que hablaron'];
const LETRAS_ORADORES_DESTINO = ['R', 'S'];

/** La confianza de una opción en la ficha, en palabras: "alta" ≥ UMBRAL_MATCH, "media" ≥ esto, "baja" debajo. */
const CONFIANZA_MEDIA = 0.6;
/** Las otras reuniones de la misma figura que se muestran como contexto en una ficha: a ± estos días. */
const DIAS_CONTEXTO_FICHA = 7;

/**
 * Inscriptos mínimos para listar un formulario sin fila (sin ningún candidato) en
 * `listarFormulariosSinFila` (paso 13, "formularios sin fila: canceladas o reubicadas"). Los de menos
 * sólo se cuentan. Es informativo: un formulario sin fila no es un faltante a reclamar (regla 9).
 */
const MIN_INSCRIPTOS_SIN_FILA = 10;

/**
 * Búsqueda inversa del paso 10 (calibración, sólo log): ventana en días alrededor de la fila, y
 * filas pedidas a mano además de las que el paso 10 ya marca como dudosas. Las de hoy: 527 (96),
 * 626 (Flores 04/06, 105) y 631. La 748 y la 769 salieron el 01/10: cerradas con el equipo.
 */
const DIAS_BUSQUEDA_INVERSA = 7;
const FILAS_BUSQUEDA_INVERSA = [527, 626, 631];

/**
 * **Subzonas de la Comuna 1** (dato del equipo, 01/10; regla de negocio 10). **No son ejes.** Los
 * títulos de los formularios las usan ("Comuna 1 Sur - 3/9"). Un formulario con subzona contra una
 * fila de un barrio de la Comuna 1 **coincide** si el barrio está en esa subzona y está en
 * **desacuerdo** si está en la otra (y entonces, regla 8: a revisión, nunca descartar). Un barrio de
 * la Comuna 1 que no esté en ninguna de las dos listas, o un formulario sin subzona: como antes,
 * comuna contra comuna.
 */
const COMUNA1_SUBZONAS = {
  Norte: ['Puerto Madero', 'Retiro', 'San Nicolás'],
  // 'Montserrat' es la otra grafía de Monserrat que tiene el destino (CLAUDE.md 3.1.h): mismo barrio.
  Sur:   ['Constitución', 'Monserrat', 'Montserrat', 'San Telmo']
};

/** Los ejes que reconoce `detectEje_`. Un `Eje X` fuera de esta lista se reporta, no se usa. */
const EJES_CONOCIDOS = ['Norte', 'Sur', 'Centro', 'Oeste', 'Este'];

/**
 * La columna de `Comunas` que la fórmula de `AG (Zona)` del destino lee:
 * `VLOOKUP(B2:B2374, Comunas!A:Z, 8, FALSE)` → columna 8, `H`. **No se usa para el eje**
 * (no lo es: ver `EJE_COMO_UBICACION`) y no se toca: la lee la fórmula del destino.
 */
const COMUNAS_COL_ZONA = 8;

/**
 * **El eje geográfico de cada barrio**: `Comunas`, columna I (9), una fila por barrio (la misma
 * fila que la columna A). Valores: `Norte`, `Sur`, `Centro`, `Oeste`, `Este`; terminado en `?`
 * si está pendiente de confirmación (no se evalúa). Se lee en tiempo de ejecución: el mapeo vive
 * en la planilla, no en el repo. Si el encabezado no es `COMUNAS_ENCABEZADO_EJE`, el eje no se
 * evalúa para ningún barrio y el bloque 2e avisa.
 */
const COMUNAS_COL_EJE = 9;
const COMUNAS_ENCABEZADO_EJE = 'Eje geográfico';

/**
 * La distancia que el bloque 2e usa para decir si un formulario temático tiene **alguna** fila
 * del destino cerca. Si no hay ninguna, es un huérfano real, no un problema de puntaje.
 */
const DIAS_TEMATICA_CERCANA = 3;

/**
 * **El texto del evento como tercera vía de ubicación** — para las reuniones temáticas.
 *
 * Hay filas del destino cuyo lugar no es un barrio ni una comuna sino un tema:
 *
 *     JORGE MACRI - Encuentro Temático "Orden Público"/ Seguridad - Eje Norte - 16/07/2026
 *
 * `Eje Norte` no es barrio ni comuna, y `Orden Público / Seguridad` es el tema. Para estas filas
 * **la ubicación no existe como concepto** — es un caso distinto del barrio que el origen dejó
 * de mandar (CLAUDE.md 3.3.b), donde el dato existía y desapareció.
 *
 * Pero el texto del evento **sí está**, en la columna `EVENTO` del destino, y el nombre del
 * formulario lo repite. Así que hay con qué confirmar: se compara un texto contra otro.
 *
 * **Vale lo mismo que el barrio (0,25) y ocupa su lugar**, no se suma aparte: una fila temática
 * con figura + fecha + evento tiene evidencia **completa**, no parcial.
 *
 * Tiene la propiedad que veníamos buscando desde 3.3.c: **se compara, no se interpreta.** Sin
 * listas fijas, sin canonización, sin parser — como la clave del flujo Agenda, que es la mejor
 * del proyecto justamente por eso.
 *
 * ### 🔴 MEDIDO: `EVENTO` no sirve como señal. Queda en `false` y no se enciende.
 *
 * **Es una categoría, no un identificador.** El bloque 2d de la corrida en seco dio que `EVENTO`
 * coincide por subcadena con **718 de 802 filas** (~90%), y los 12 casos que listó eran todos
 * `Encuentro con Vecinos`. Una señal que coincide con el 90% no discrimina nada.
 *
 * Y como vía de relevancia de `EMPAREJAR_MANUAL` hacía daño: **subió la densidad de 2,6 a 8,2
 * pares por fila.** Se sacó de la puerta, que vuelve a `figura Y (fecha ±21 O comuna)` —más el
 * eje, cuando se confirme (`EJE_COMO_UBICACION`).
 *
 * Las temáticas siguen siendo un caso real, pero lo que las distingue está en el **nombre del
 * formulario** (`Temática Salud`, `Eje Sur`), no en la columna `EVENTO` del destino. Ver
 * `esFormularioTematico_` y `detectEje_`.
 *
 * La medición del bloque 2d se deja: es la que sostiene este número.
 */
const EVENTO_COMO_UBICACION = false;

/**
 * Cuántas palabras de contenido del `EVENTO` tienen que aparecer en el nombre del formulario
 * para dar la coincidencia por palabras. Con una sola alcanzaría cualquier cosa.
 */
const MIN_PALABRAS_EVENTO = 2;

/** Palabras que no distinguen nada y no cuentan para la coincidencia por palabras. */
const PALABRAS_VACIAS_EVENTO = [
  'con', 'los', 'las', 'del', 'para', 'por', 'una', 'unos', 'unas', 'que',
  'encuentro', 'encuentros', 'reunion', 'reuniones', 'vecinos', 'vecinas',
  'tematico', 'tematica', 'tematicos', 'tematicas', 'eje', 'jorge', 'macri'
];

/**
 * **Hasta 3 días de distancia es la misma reunión.** La reunión se corre 2 o 3 días y el
 * formulario queda con la fecha original (CLAUDE.md 1.a y 3.3.c).
 *
 * Lo mostró `diagCorteB()`: en las 20 `desfase_reprogramacion` (antes mal llamadas
 * `fecha_mal_parseada`) **el texto y `fecha_fin` coinciden entre sí, y el que difiere es el
 * destino**, por 1 a 3 días — 01/08 contra 29/07, 23/09 contra 22/09, 10/04 contra 08/04. No hay
 * ningún mes mal: por eso la regla del mes resolvió 0 de 20. **El parseo no es el problema.**
 */
const TOLERANCIA_REPROGRAMACION_DIAS = 3;

/**
 * **La fecha es señal, no clave.** Ninguna banda descarta por sí sola: un desvío de 9 días
 * puntúa 0 pero no elimina al candidato.
 *
 * **Dentro de `TOLERANCIA_REPROGRAMACION_DIAS` puntúa como coincidencia plena**, igual que la
 * fecha exacta: dentro de esa tolerancia es la misma reunión corrida. La escala anterior
 * (exacta 0,30 · ±1 0,24 · ±3 0,15) **castigaba justo la reprogramación** y dejaba esas filas
 * debajo del umbral: figura + fecha ±3 daba 0,77, figura + fecha ±3 + comuna 0,81.
 *
 * El escalón de ±7 queda como estaba: "la misma semana" aporta algo sin alcanzar para decidir.
 *
 * Costo, anotado: dos reuniones de la misma figura a 3 días o menos ahora empatan en fecha. No
 * se escribe ninguna sola — el empate cae en `MARGEN_MINIMO` y va a `REVISAR_MATCH`.
 */
const BANDAS_FECHA = [
  { dias: TOLERANCIA_REPROGRAMACION_DIAS, peso: PESOS_MATCH.fechaExacta },
  { dias: 7, peso: PESOS_MATCH.fecha7Dias }
];

/**
 * `UMBRAL_MATCH` ya **no es provisorio: sale de un valle medido**, no de una elección.
 *
 * La corrida en seco del 2026-09-25 mostró dos poblaciones separadas y un hueco limpio entre
 * ellas:
 *
 *     >= 0.90   690 filas   ← los matches buenos
 *     0.80-0.90   2 filas   ← el valle
 *     ~0.65      82 filas   ← a las que les falta una señal entera
 *
 * Con 0.75 los 16 casos de la zona 0.70-0.80 entraban **sin razón clara**, que es exactamente la
 * zona gris que un umbral tiene que evitar. En 0.88 el corte cae adentro del valle: mueve el
 * resultado lo mínimo posible ante un cambio chico del umbral, que es la propiedad que uno
 * quiere de un corte.
 *
 * `MARGEN_MINIMO` sigue puesto a ojo.
 *
 * Se calibran corriendo `diagScores()` (diagnostico/02_corte_B_a_B2.js) contra las 103 filas de
 * DIAG_CORTE_B y mirando la distribución real: cuántas superarían el umbral, con qué margen, y
 * cuántas caen en multi_figura. Hasta entonces, cualquier valor acá es una suposición.
 *
 * Se aplican sobre el score **normalizado**, no sobre el absoluto:
 *
 *   normalizado >= UMBRAL_MATCH, margen ok, sin desacuerdo →  escribe y estampa RDV_UID
 *   desacuerdo de ubicación con el resto alto              →  REVISAR_MATCH
 *   margen chico, o multi_figura                           →  REVISAR_MATCH
 *   ningún candidato, o ninguno lo bastante bueno          →  SIN_MATCH
 *
 * Decide el umbral **más el margen contra el segundo candidato**, no la unicidad: que haya un
 * solo candidato no lo vuelve correcto, y que haya varios no vuelve al mejor incorrecto.
 */
const UMBRAL_MATCH  = 0.88;
const MARGEN_MINIMO = 0.15;

/**
 * **El mes del texto sólo vale si es el de `fecha_fin` o el siguiente.**
 *
 * Regla de negocio confirmada (CLAUDE.md 1.c): en el formulario **el año y el mes de
 * `fecha_fin` siempre vienen bien; sólo el día puede estar corrido**. El nombre del formulario
 * aporta el día y nada más.
 *
 * El "o el siguiente" cubre el formulario que cierra a fin de mes con la reunión los primeros
 * días del mes que viene. Más de uno no tiene caso: no hay reuniones a dos meses del cierre.
 */
const MESES_ADELANTE_TEXTO = 1;

/** Tolerancia para dar por coincidente la hora, en minutos. El texto libre rara vez es exacto. */
const TOLERANCIA_HORA_MIN = 30;

// ===================== B2: la lógica de negocio que hay que no perder =====================

/**
 * **Las columnas de `B`, por nombre** (02/10). Es **el único lugar** que sabe cómo se llaman: si el
 * origen vuelve a cambiar los encabezados, se toca sólo esta tabla.
 *
 * Por qué existe: desde que `B` es un `QUERY` sobre `Hoja1` (02/10), los encabezados son los del
 * origen (`inscriptos_M`, `inscriptos_identificados`, `inscriptos_edades_66plus`…) y no los que tenía
 * `B` antes (`Inscriptos M`, `Inscriptos unicos identificados`, `Inscriptos edades 66+`…). El upsert
 * los buscaba con los nombres viejos, como opcionales, y al no encontrarlos **calculó con ceros**:
 * `Sin identificar = Inscriptos`, y lo escribió donde estaba vacío (paso 18 lo deshace).
 *
 * Cada campo: `[nombre actual, alias viejo…]`. Se busca por encabezado normalizado. **Todos son
 * obligatorios menos los de `COLUMNAS_B_OPCIONALES`**: si falta uno, `leerCandidatos_` tira error y
 * nada se calcula ni se escribe. Nunca más un cero que salió de una columna no encontrada.
 *
 * Cambios de palabra, no sólo de formato: identificados ← `inscriptos_identificados` (antes "unicos
 * identificados"); 66+ ← `inscriptos_edades_66plus`; Call Center ← `inscriptos_canal_CallCenter`.
 * `inscriptos_conMail`, `inscriptos_conCelular` e `inscriptos_conFijo` no se usan.
 */
const COLUMNAS_B = {
  nombre:            ['nombre', 'Nombre'],
  fechaFin:          ['fecha_fin', 'Fecha_Fin'],
  inscriptos:        ['inscriptos', 'Inscriptos'],
  identificados:     ['inscriptos_identificados', 'Inscriptos unicos identificados'],
  M:                 ['inscriptos_M', 'Inscriptos M'],
  F:                 ['inscriptos_F', 'Inscriptos F'],
  X:                 ['inscriptos_X'],                                       // nueva (02/10)
  canalMailing:      ['inscriptos_canal_Mailing', 'Inscriptos canal Mailing'],
  canalFacebook:     ['inscriptos_canal_Facebook', 'Inscriptos canal Facebook'],
  canalGoogle:       ['inscriptos_canal_Google', 'Inscriptos canal Google'],
  canalCallCenter:   ['inscriptos_canal_CallCenter', 'Inscriptos canal Call Center'],
  canalDifusion:     ['inscriptos_canal_Difusion', 'Inscriptos canal Difusion'],
  canalIVR:          ['inscriptos_canal_IVR', 'Inscriptos canal IVR'],
  canalProgrammatic: ['inscriptos_canal_Programmatic', 'Inscriptos canal Programmatic'],
  canalOtros:        ['inscriptos_canal_Otros', 'Inscriptos canal Otros'],
  edad18_24:         ['inscriptos_edades_18_24', 'Inscriptos edades 18-24'],
  edad25_39:         ['inscriptos_edades_25_39', 'Inscriptos edades 25-39'],
  edad40_55:         ['inscriptos_edades_40_55', 'Inscriptos edades 40-55'],
  edad56_65:         ['inscriptos_edades_56_65', 'Inscriptos edades 56-65'],
  edad66:            ['inscriptos_edades_66plus', 'Inscriptos edades 66+']
};
/** Los campos de COLUMNAS_B que pueden faltar sin frenar nada. */
const COLUMNAS_B_OPCIONALES = ['X'];

/** Banda de edad del destino → campo de COLUMNAS_B. */
const EDADES_B = {
  '18-24': 'edad18_24', '25-39': 'edad25_39', '40-55': 'edad40_55', '56-65': 'edad56_65', '66+': 'edad66'
};

/**
 * **Colapso de canales: 8 en el origen → 5 en el destino.**
 *
 * Es lógica de negocio real y confirmada, y hasta hoy **existía sólo adentro de
 * `syncB_to_B2`** ([Sync B to B2.js:117-121](Sync%20B%20to%20B2.js#L117)). Vive acá para que
 * reescribir B2 no se la lleve puesta.
 *
 * Columna del destino → campos de `COLUMNAS_B` que suma.
 *
 * **"Otros" → Difusión, como el legado, y en consulta (03/10).** En el destino no hay regla
 * consistente: hasta 09/2025 iba a Difusión; desde 10/2025 depende de quién carga (a veces RRSS). Se
 * preguntó al equipo qué es "Otros" y dónde va (docs/ESTADO.md, 1a). Si define otra cosa, se cambia
 * sólo esta tabla. El sistema escribe sólo en celdas vacías: no pisa lo que cargue el equipo.
 */
const MAPEO_CANALES = {
  'Mail':        ['canalMailing'],
  'Call Center': ['canalCallCenter'],
  'IVR':         ['canalIVR'],
  'RRSS':        ['canalFacebook', 'canalGoogle', 'canalProgrammatic'],
  'Difusión':    ['canalDifusion', 'canalOtros']
};

/**
 * **El divisor del escalado de sexo** (02/10). `B` trae `inscriptos_M` e `inscriptos_F` contados
 * sobre un subconjunto de `inscriptos`; B2 los llevaba a proporción del total dividiendo por los
 * identificados. Desde el 02/10 el origen manda además `inscriptos_X`, así que no es seguro que
 * "identificados" siga siendo el mismo número que antes. Opciones: `'identificados'` (el del legado),
 * `'M+F'`, `'M+F+X'`. El paso 17 mide cuál coincide con B2 antes de fijarlo.
 */
const DIVISOR_SEXO = 'identificados';

/**
 * **En `Inscriptos`, un 0 del destino cuenta como vacío** (decisión del usuario, 02/10): es "sin
 * cargar", como en el paso 10. Casos al 02/10: filas 6, 680, 696 y 697.
 */
const INSCRIPTOS_CERO_ES_VACIO = true;

/**
 * El backup del destino tomado el 02/10 antes de la primera escritura real (docs/backup.md §8.1). Lo
 * lee —sólo lectura— el paso 18 para saber qué celdas estaban vacías antes de que escribiera el
 * sistema.
 */
const RDV_SS_BACKUP_0210 = '1QLDcmTb01LC_pw4DRXBqIWOEcutvOBeOkVwvQd4OGEY';

/**
 * **Escalado de sexo.** `B` trae M y F contados sobre los identificados, que son menos que
 * `inscriptos`. B2 los lleva a proporción del total ([Sync B to B2.js:166-169](Sync%20B%20to%20B2.js#L166)):
 *
 *     Masculinos = round(Inscriptos × M / divisor)      divisor: DIVISOR_SEXO
 *     Femeninos  = round(Inscriptos × F / divisor)
 *
 * Con divisor 0 no se escala nada: quedan vacíos, no en cero (CLAUDE.md 0.a).
 *
 * Desde el 02/10 el origen manda también `inscriptos_X`. El destino no tiene columna para X: se lee
 * sólo para medir el divisor (paso 17).
 */
function escalarSexo_(inscriptos, cuenta, identificados) {
  const ins = numOcero_(inscriptos), c = numOcero_(cuenta), id = numOcero_(identificados);
  if (!(id > 0)) return '';
  return Math.round(ins * (c / id));
}

/**
 * **Las edades NO se escalan.** Se copian crudas de `B` y `Sin identificar` absorbe el resto
 * ([Sync B to B2.js:124-129](Sync%20B%20to%20B2.js#L129)):
 *
 *     Sin identificar = max(0, Inscriptos − suma de las cinco bandas)
 *
 * **Es una asimetría real y hay que conocerla**: el sexo queda a escala de `Inscriptos` y las
 * edades a escala de `identificados`, con la diferencia empujada a `Sin identificar`. Por eso
 * `DIAG_ATOMICIDAD` ve `suma_sexo` y `suma_edades` comportarse distinto contra el mismo total.
 *
 * No se cambia acá: cambiar el criterio cambiaría números ya publicados. Queda documentado.
 */
function sinIdentificar_(inscriptos, sumaBandas) {
  const ins = numOcero_(inscriptos);
  if (!(ins > 0)) return '';
  return Math.max(0, ins - numOcero_(sumaBandas));
}

/**
 * Las columnas con las que queda B2 después del rediseño (CLAUDE.md 1.c).
 *
 * **Se fue todo lo que era clave o corrección**: `ID`, `KEY`, `Clave PIM`, `Procesado BF`,
 * `Fecha C`, `Persona (manual)`, `Barrio (manual)`, `Fecha (manual)`. B2 deja de ser superficie
 * de corrección y pasa a ser **vista de lectura**.
 */
const COLUMNAS_B2 = [
  'Nombre',
  'Mail', 'Call Center', 'IVR', 'RRSS', 'Difusión',
  'Inscriptos', 'Masculinos', 'Femeninos',
  '18-24', '25-39', '40-55', '56-65', '66+', 'Sin identificar',
  'Persona', 'BarrioN', 'Comuna', 'Fecha',
  'RDV_UID', 'form_score'
];

// ===================== Texto libre del origen =====================

/**
 * Prefijos administrativos que el origen antepone al nombre del evento, y que `limpiarPrefijos_`
 * saca del texto.
 *
 * **Para la figura: medido y descartado** (25/09 20:18). No compraba nada —0 formularios con una
 * figura en el prefijo y otra en el cuerpo— y costaba 41 (18 en ventana) que perdían su única
 * figura. `figurasEnTexto_` ya no limpia prefijos.
 *
 * ⚠️ **Para barrio, comuna, eje, temática, hora y fecha sigue siendo una hipótesis sin medir**:
 * `leerCandidatos_` todavía detecta todo eso sobre el texto limpio. Ver `limpiarPrefijos_` en
 * `02_Parsing.js`.
 *
 * Se comparan normalizados y sólo al principio del texto.
 */
const PREFIJOS_EVENTO = [
  'vinculo ciudadano',
  'jorge macri',
  'post'
];

/**
 * Marca de formulario anulado. **Un formulario con esto no es candidato de nada**: no se
 * propone, no se puntúa, no aparece en `EMPAREJAR_MANUAL`.
 *
 * Es distinto de "no matcheó": es el origen diciendo explícitamente que esa carga no vale.
 * Tratarlo como candidato sería reintroducir a mano un dato que alguien ya descartó.
 */
const MARCA_ANULADO = 'NO USAR';

// ===================== Trazabilidad del match =====================

/**
 * Columnas nuevas al final del destino, junto a `RDV_UID` (CLAUDE.md, decisión 2).
 *
 * ~~Se escriben también cuando el score NO alcanzó.~~ Desde el 01/10, sólo en las filas que se
 * escriben (decisión z de docs/ESTADO.md).
 *
 * `form_origen` va **literal, sin normalizar**: es la trazabilidad, no una clave.
 *
 * **`form_clave` (02/10)** es la clave estable del formulario (`claveFormulario_`: nombre
 * normalizado + Fecha_Fin). Es lo que enlaza la fila con SU formulario entre corridas: el nombre solo
 * no alcanza cuando en `B` hay dos formularios con el mismo nombre (la 309 y la 315 de la copia, el
 * 02/10). Se agrega al final con `paso1_columnasDeTraza()`; las filas escritas antes la completan en la
 * corrida siguiente, cuando su formulario se puede resolver sin ambigüedad.
 */
const COLUMNAS_TRAZA = [
  'RDV_UID', 'form_origen', 'form_score', 'form_nivel', 'form_fecha_match', 'form_clave'
];

/**
 * **Gemelos** (regla 3, ajustada el 02/10): formularios con el **mismo nombre** (normalizado) **y
 * cierres (`Fecha_Fin`) a GEMELOS_MAX_DIAS días o menos** son la misma reunión. Mismo nombre con
 * cierres más lejos son **reuniones distintas** y se tratan como formularios distintos, por su clave
 * (caso: Macri "Encuentro Temático 'Orden Público'/ Seguridad - Eje Norte", cierres 16/07 y 28/07 →
 * filas 697 y 709). Los cierres se encadenan: a 5 y a 5 días, los tres son un grupo.
 */
const GEMELOS_MAX_DIAS = 7;

/**
 * **Regla 3 dentro de un grupo de gemelos** (02/10): el que casi no tiene inscriptos no se hizo. Un
 * gemelo con hasta este número de inscriptos, en un grupo donde otro tiene más, **se descarta** como
 * candidato (no compite por ninguna fila; el bloque 0b lo lista), aunque los cierres no sean iguales.
 * Si en el grupo quedan dos o más con más que esto, no hay forma de saber cuál es: ninguno se escribe
 * solo (`clave_repetida`, a revisión).
 *
 * Casos: 1 contra 1344 (708), 2 contra 72 (134: B 123 18/08, B 140 21/08), 0 contra 49 (315: B 310,
 * B 317), 0 contra 116 (768: B 785 27/08, B 790 02/09).
 */
const MAX_INSCRIPTOS_CASI_CERO = 5;

/** Solapa de propuestas de emparejamiento a mano (CLAUDE.md, decisión 2). */
const RDV_HOJA_EMPAREJAR = 'EMPAREJAR_MANUAL';

/**
 * Piso para **proponer** un par en `EMPAREJAR_MANUAL`. Deliberadamente bajo: el objetivo ahí no
 * es acertar sino no ofrecer un producto cartesiano. Un par se propone si comparte figura o si
 * cae en `VENTANA_EMPAREJAR_DIAS`; por debajo, no se propone nada.
 */
const PISO_EMPAREJAR = 0.30;
const VENTANA_EMPAREJAR_DIAS = 21;

/**
 * **Tope de pares propuestos por fila del destino** en `EMPAREJAR_MANUAL`. `null` = sin tope.
 *
 * El problema medido (26/09 14:21) es una sola figura: Jorge Macri tiene 328 de 346 pares en
 * ventana, 10,3 por fila; el resto está entre 1,3 y 3,3. Con un tope, cada fila se queda con sus
 * N mejores pares, ordenados por score y después por cercanía de fecha.
 *
 * Es una lista de propuestas para una persona: **no cambia ningún veredicto**. El bloque 3 del log
 * simula el tope en 3 aunque esto esté en `null`, para decidir con el número delante.
 *
 * **Fijado en 3 (26/09), con una garantía:** un formulario al que el tope dejaría sin ningún par
 * conserva su mejor par, aunque exceda el tope de esa fila. Simulado sin la garantía, la densidad
 * bajaba de 11,0 a 2,6 sin dejar ninguna fila vacía, pero 5 formularios se quedaban sin ninguna
 * propuesta: el tope no puede hacer desaparecer un formulario de la lista. El bloque 3 lista los
 * que la garantía rescata, con el par que conservan, y la densidad final.
 */
const MAX_PARES_POR_FILA = 3;

/** El tope que el bloque 3 simula siempre, para ver qué haría uno antes de fijarlo. */
const MAX_PARES_POR_FILA_SIMULADO = 3;

// ===================== STATUS REUNIÓN =====================

/**
 * Los cinco valores que toma `STATUS REUNIÓN` en el destino (CLAUDE.md 3.4). Son los únicos
 * que aparecen como literal en todo el legado.
 */
const STATUS_CONOCIDOS = [
  'en agenda', 'Realizada', 'Reprogramada', 'Suspendida', 'Se modifico el barrio'
];

/**
 * La única transición que el pipeline puede escribir sobre `STATUS REUNIÓN`
 * (CLAUDE.md, sección 0 → "La única excepción", y decisión 12).
 *
 * **Whitelist de un solo estado de origen, a propósito.** La regla NO es "cualquier estado que
 * no sea Realizada": eso permitiría pisar una reunión que alguien suspendió o reprogramó a
 * mano. Sólo se avanza desde `en agenda`, que es el único estado que significa "todavía no
 * pasó nada". `Suspendida`, `Reprogramada` y `Se modifico el barrio` son decisiones de una
 * persona y el pipeline no las toca nunca.
 *
 * Es la misma regla que ya usa `marcarRevisadaEnOrden()` en el legado
 * ([En agenda a Realizada.js:14-16](En%20agenda%20a%20Realizada.js#L14)) — lo que está mal ahí
 * es cómo escribe, no qué decide (CLAUDE.md 3.1.g).
 */
const TRANSICION_REALIZADA = { desde: 'en agenda', hacia: 'Realizada' };

/** Mínimo de asistentes para dar una reunión por realizada. Mismo valor que el legado. */
const MIN_ASISTENTES_REALIZADA = 1;

// ===================== Alertas =====================

/**
 * Ventana de `verificarCambiosRecientes_()` (40_Alertas.js), en días.
 *
 * **Se mide sobre la fecha de la reunión, no sobre cuándo se cargó la fila**, porque no hay
 * ninguna columna con timestamp de carga en el destino ni en B2. Es una aproximación: una fila
 * vieja que alguien completa hoy queda fuera de la ventana. El día que exista una columna de
 * timestamp, esto debería medirse sobre ella.
 */
const VENTANA_ALERTA_DIAS = 15;

// ===================== AGENDA, etapa 2: crear y actualizar filas del destino (06/10) =====================
// Prompt: docs/prompts/PROMPT-06-AGENDA-ETAPA2-CREAR-ACTUALIZAR.md. Código: 40_Agenda.js (+ 41_AgendaParser.js).

/**
 * **La agenda dentro del activador de cada hora** (upsertDiario → upsertDestino, antes del cruce con los formularios).
 * **Prendida el 07/10** (decisión del usuario, después de semana() y los ajustes). Con `false`, la agenda corre sólo a
 * mano (paso 37). Para apagarla: `false` + clasp push; para volver atrás una corrida: paso 38.
 */
const AGENDA_ACTIVA = true;
/**
 * **Sólo una semana** (protección de la primera corrida real): el LUNES de la semana, 'yyyy-MM-dd' (p. ej.
 * '2026-10-05'). La agenda sólo crea, vincula, actualiza, mueve y suspende reuniones de esa semana. `null` = todo el
 * alcance (desde hoy − DIAS_ACTIVOS en adelante).
 */
const AGENDA_SOLO_SEMANA = null;
/** La etiqueta de Gmail de donde se leen los mails de agenda (la cuenta que corre el script tiene que tenerla). */
const AGENDA_ETIQUETA_GMAIL = 'GCBA/Encuentros Con Vecinos';
/**
 * Y además por ASUNTO (06/10: la etiqueta sola trajo 10 mails y faltaban tres semanas): los mails cuyo asunto trae
 * alguna de éstas, en los días del alcance, sin duplicar con los de la etiqueta.
 */
const AGENDA_ASUNTOS_GMAIL = ['Agenda Encuentros de vecinos', 'Agenda de Encuentros con Vecinos'];
/** Las esperas entre reintentos al abrir o escribir la intermedia (06/10: abrirla falló tres veces seguidas). */
const AGENDA_ESPERAS_INTERMEDIA_MS = [2000, 5000, 10000];
/**
 * El archivo propio y liviano de los registros de la agenda, "RDV registros" (07/10): `null` = en la intermedia. Lo crea
 * `paso40_archivoRegistros()` (copia REGISTRO_AGENDA y REGISTRO_AGENDA_CAMBIOS) y dice el ID para poner acá.
 */
const RDV_SS_REGISTROS = null;
/** Los pasos de medición (29-32, 35) escriben sus solapas en la intermedia sólo si se pide (07/10): el log alcanza. */
const MEDICION_ESCRIBE_SOLAPAS = false;
/** Las solapas de MEDICIÓN de la etapa 1 de Agenda (cerrada): las borra `paso39_limpiarIntermedia()`. */
const SOLAPAS_MEDICION_ETAPA1 = ['DIAG_MAILS', 'AGENDA_MAIL', 'AGENDA_MAIL_DESAPARECIDAS', 'AGENDA_CRUCE', 'AGENDA_DESTINO_SIN_MAIL',
  'AGENDA_BARRIO_DIRECCION', 'AGENDA_SEGURIDAD'];
/**
 * Restos del legado y de diagnósticos viejos en la intermedia (07/10, ~59% de las celdas con datos): sólo PROPUESTA.
 * `paso39b_limpiarLegado()` los borra únicamente con `LIMPIAR_LEGADO_CONFIRMADO = true` (decisión del usuario).
 */
const SOLAPAS_LEGADO_INTERMEDIA = ['C', 'Reporte Sincronización BF', 'DIAG_PISADO', 'Copia de B', 'Hoja 10', 'Hoja 5',
  'DIAG_TOTAL_DIVERGENTE', 'DIAG_ATOMICIDAD', 'DIAG_FECHA_FIN', 'DIAG_SCORES', 'DIAG_CORTE_B', 'DIAG_HUECO', 'DIAG_DUP_B2',
  'DIAG_ANCLA_FECHA', 'DIAG_PROCEDENCIA', 'TEST CLAVES', 'AUDIT Claves', 'TEST PUNTUAL', 'REPORTE_A2_vs_B2', 'Base Final',
  'import B2 Completo', 'REVISAR_FORMATO_PRUEBA', 'REVISAR_MATCH_DEMO'];
const LIMPIAR_LEGADO_CONFIRMADO = false;
/** Regla de confianza del barrio, (c): el punto tiene que estar a MÁS de estos metros de cualquier otro barrio. */
const BARRIO_MARGEN_M = 100;
/**
 * El EVENTO de una fila nueva, según el tipo de la reunión del mail, **como lo escribe el equipo** (06/10, de la tabla
 * del paso 37 en seco): "{tema}" e "{invitado}" se completan con lo que dice el evento del mail (`eventoAgenda_`).
 * "Café con Vecinos": sin confirmar (no apareció en el destino); la corrida en seco vuelve a listar la tabla.
 */
const AGENDA_EVENTO_POR_TIPO = {
  'Encuentro con Vecinos': 'Encuentro con Vecinos',
  'Encuentro "1 a 1"': 'Uno a uno',
  'Encuentro Temático': 'Encuentro Temático "{tema}"',
  'Primera Persona': 'Encuentro "Primera Persona" con {invitado}',
  'Café con Vecinos': 'Café con Vecinos',
  'Seguridad en tu Barrio': 'Encuentro con Vecinos'
};
/** La columna nueva con las figuras que NO participan (regla 2): los nombres, separados por " / ". */
const COLUMNA_NO_PARTICIPA = 'No participa';
/**
 * Las columnas nuevas de la agenda, AL FINAL del destino, después de `form_clave` (nunca insertadas en el medio:
 * correrían los fondos, CLAUDE.md §6). Las `agenda_*_escrita` guardan lo que escribió el sistema: una celda se
 * actualiza SÓLO si todavía tiene eso (si alguien la cambió, no se toca nunca más).
 */
const COLUMNAS_AGENDA = [
  COLUMNA_NO_PARTICIPA, 'agenda_uid', 'agenda_mail', 'agenda_version', 'agenda_hora_escrita',
  'agenda_direccion_escrita', 'agenda_barrio_escrito', 'agenda_fecha_escrita', 'agenda_status_escrito',
  // 07/10 (prompt 07): quién creó y quién tocó la fila, y lo del mail que la forma del equipo no guarda
  'Origen fila', 'Tocado por el equipo', 'Evento (mail)', 'Lugar (mail)', 'Dirección (mail)', 'Marcas (mail)', 'Conjunta con'
];
/** "Origen fila" (07/10): quién creó la fila. Las filas del equipo que la agenda no vinculó: ORIGEN_EQUIPO. */
const ORIGEN_SISTEMA = 'sistema (agenda)';
const ORIGEN_EQUIPO = 'equipo';
const ORIGEN_AMBOS = 'equipo + agenda';
/**
 * **AGENDA_DUPLICADOS** (07/10, en el ARCHIVO del destino, como REVISAR_MATCH): lo que la agenda no crea porque hay una
 * fila parecida del equipo (la misma figura a ±AGENDA_DUP_DIAS días, o la misma fecha y comuna con otra figura o sin
 * figura), con ELEGIR adelante; y los duplicados que aparecen después de crear (informativos). Las elecciones se
 * guardan en ELECCIONES_AGENDA (archivo de registros o intermedia) y se aplican en la corrida siguiente.
 */
const AGENDA_SOLAPA_DUPLICADOS = 'AGENDA_DUPLICADOS';
const RDV_HOJA_ELECCIONES_AGENDA = 'ELECCIONES_AGENDA';
const AGENDA_DUP_DIAS = 2;
const AGENDA_OPCIONES_DUPLICADO = ['Es la misma: vincular', 'Ya está cargada en otra fila: no crear', 'Son distintas: crear', 'No sé'];
/**
 * **La cancelación se pregunta** (07/10, decisión del usuario): con `false`, una reunión futura que desaparece del mail
 * NO se suspende ni se borra sola: se pregunta en AGENDA_DUPLICADOS (AGENDA_OPCIONES_CANCELACION) con la fila, la
 * reunión y el mail que la sacó, y se aplica en la corrida siguiente ("Se canceló": suspender, o borrar si la creó la
 * agenda y nadie la tocó; "Sigue": no se toca y no se vuelve a preguntar). Con `true`, la regla 7 automática.
 */
const AGENDA_CANCELACION_AUTOMATICA = false;
const AGENDA_OPCIONES_CANCELACION = ['Se canceló: suspender/borrar', 'Sigue', 'No sé'];
/**
 * **La dirección en el cruce con RDV CONJUNTO** (07/10, dato del usuario: en general es la misma que la del destino/mail,
 * aunque no siempre escrita igual). Con `true`: la figura de una Seguridad en tu Barrio sale primero de fecha +
 * DIRECCIÓN (exacta o parecida), después fecha + barrio, después fecha + comuna; y en Asistentes/oradores, con 2+ filas
 * de la figura ese día, se desempata primero por dirección. `false` hasta medirlo: `paso45_medirDireccionConjunto()`
 * (sólo lectura) dice qué cruces cambiarían; tiene que dar 0 cambios en los que ya están bien.
 */
const CRUCE_CONJUNTO_POR_DIRECCION = true;   // 07/10: prendido con el paso 45 (CAMBIA 0, PIERDE 0; ESTADO 0.z)
/** Dos direcciones con la misma calle y números a esta distancia o menos son "parecidas". */
const DIRECCION_NUMERO_TOLERANCIA = 100;
const DESC_PROTECCION_DUPLICADOS = 'RDV: la escribe la agenda — sólo se escribe en ELEGIR y COMENTARIO';
/**
 * **Llenar las columnas del equipo como las llena el equipo** (07/10, prompt 07, B). Valores iniciales: lo que la agenda
 * venía escribiendo; `paso41_medirFormatoEquipo()` (sólo lectura) mide cómo las llena hoy el equipo y dice qué poner:
 *   - AGENDA_DIRECCION_FORMA: 'completa' = la línea "Lugar:" del mail entera ("Chile 1769, Asociación Civil…");
 *     'calle' = sólo calle y número ("A CONFIRMAR…" va igual, tal cual). Lo que se acorta queda en "Dirección (mail)";
 *   - AGENDA_EVENTO_CON_EJE: true = 'Encuentro con Vecinos - Eje Norte' cuando el mail trae eje;
 *   - AGENDA_HORA_AJUSTE_MIN: minutos a sumar a la hora del mail (la del mail es la de convocatoria);
 *   - AGENDA_COPIAR_FORMATO: las filas nuevas toman el formato numérico (fecha, hora) de la última fila con datos.
 */
const AGENDA_DIRECCION_FORMA = 'completa';
const AGENDA_EVENTO_CON_EJE = false;
const AGENDA_HORA_AJUSTE_MIN = 0;
const AGENDA_COPIAR_FORMATO = true;
/**
 * El formato de las columnas de traza de la agenda (07/10, después de semana()): se pone ANTES de escribir. Sin él,
 * Sheets en español leyó "3 de 3" como el 3 de marzo (46084) y dejó la hora y la fecha como número (0,6979…, 46301,5).
 */
const AGENDA_FORMATO_COLUMNAS = { 'agenda_version': '@', 'agenda_hora_escrita': 'h:mm', 'agenda_fecha_escrita': 'd/MM/yyyy' };
/** Las columnas del destino que la agenda puede escribir (la excepción `escribirAgendaLote_`, 05_Escritura.js). */
const COLUMNAS_QUE_ESCRIBE_AGENDA = ['Figura', 'EVENTO', 'FECHA', 'HORA', 'Dirección', 'Barrio', 'STATUS REUNIÓN']
  .concat(COLUMNAS_AGENDA);
/** Las transiciones de STATUS que puede escribir la agenda (y ninguna otra). */
const AGENDA_TRANSICIONES_STATUS = [
  { desde: '', hacia: 'en agenda' },               // fila nueva o vinculada con STATUS vacío
  { desde: 'en agenda', hacia: 'Suspendida' },     // regla 7: desapareció siendo futura
  { desde: 'Suspendida', hacia: 'en agenda' }      // regla 7: volvió (sólo si el "Suspendida" lo puso el sistema)
];
/** REGISTRO_AGENDA (intermedia): una línea por corrida. REGISTRO_AGENDA_CAMBIOS: cada celda cambiada, antes y después. */
const RDV_HOJA_REGISTRO_AGENDA = 'REGISTRO_AGENDA';
const RDV_HOJA_REGISTRO_AGENDA_CAMBIOS = 'REGISTRO_AGENDA_CAMBIOS';
/** Las reuniones viejas del mail (antes de hoy − DIAS_ACTIVOS) sin fila: sólo informativa, no se crean. */
const AGENDA_SOLAPA_VIEJAS = 'AGENDA_VIEJAS_SIN_FILA';
/** "Seguridad en tu Barrio" con la figura ambigua o todavía sin fila en RDV CONJUNTO: la carga el equipo en la fila. */
const AGENDA_SOLAPA_FIGURA = 'AGENDA_FIGURA_A_COMPLETAR';
/**
 * **La copia de la agenda en el archivo "Agenda"** (punto 17 del prompt, 06/10): una fila por reunión (la última versión
 * de su semana), reescrita entera en cada corrida de la agenda, con formato y protegida con advertencia. Es un archivo
 * NUEVO (06/10, de reporteseinformesgcba@gmail.com), distinto del archivo de Agenda del legado (`RDV_SS_AGENDA`,
 * `1hP8zMN8…`), que es el que leen y escriben "Agenda traer datos del mail.js", "Agenda push a base.js" y
 * "Solapa agenda base final.js". Ningún código del legado abre éste. La cuenta que corre el script tiene que ser editora.
 */
const AGENDA_COPIA_SS = '1_W4qryMY0_s1Vxdk5mxov4ABUvWyFSq7dN1HU7uk4j0';
const AGENDA_COPIA_SOLAPA = 'Agenda';
/**
 * 07/10: el archivo "Agenda" tiene dos solapas, las dos reescritas en cada corrida y protegidas: AGENDA_COPIA_SOLAPA, la
 * semana en curso (y las que vienen, si ya llegó su mail), y AGENDA_COPIA_SOLAPA_CERRADA, las semanas que ya terminaron,
 * la más nueva primero. El lunes, la semana que terminó pasa sola a "Agenda cerrada" (se decide por fecha en cada corrida).
 */
const AGENDA_COPIA_SOLAPA_CERRADA = 'Agenda cerrada';
/**
 * Desde qué fecha entran reuniones a la copia ('yyyy-MM-dd'): "desde que arranca Agenda" (no se rellena el histórico).
 * `null` = el mismo alcance que el destino (hoy − DIAS_ACTIVOS, o la semana de AGENDA_SOLO_SEMANA). Al prender la
 * agenda, poner acá el lunes de la primera semana: Gmail se lee desde ahí.
 */
const AGENDA_COPIA_DESDE = null;
/** Las columnas de la copia, en este orden (decisión del usuario, con agregados). */
const AGENDA_COPIA_COLUMNAS = ['Semana', 'Grupo', 'Día', 'FECHA', 'HORA', 'Figura', 'No participa', 'Conjunta con', 'EVENTO',
  'Lugar del mail', 'Dirección', 'Barrio calculado', 'Comuna', 'Sin barrio porque', 'Marcas', 'Estado en la agenda', 'Cambios',
  'Fecha original', 'Fila del destino', 'STATUS en el destino', 'Mail', 'Versión', 'Última actualización'];
const DESC_PROTECCION_COPIA_AGENDA = 'RDV: la escribe el sistema en cada corrida de la agenda — corregir en el destino, no acá';

/** Paso 16: una fila "en agenda" con la fecha pasada hace más de estos días es un aviso. */
const AGENDA_DIAS_VENCIDA = 2;
