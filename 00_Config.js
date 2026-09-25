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
const RDV_HOJA_DESTINO   = 'RVD JM-CM - ES';   // el único destino
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

// --- solapas de (3) y (4) ---
const RDV_HOJA_ORIGEN = 'Hoja1';   // en (3). NO somos dueños, no se modifica
const RDV_HOJA_AGENDA = 'Agenda';  // en (4)

const RDV_TZ = 'America/Argentina/Buenos_Aires';

// ===================== Columnas =====================

/**
 * Columnas que carga el equipo a mano. El pipeline **las lee y nunca las escribe, ni aunque
 * estén vacías** (CLAUDE.md, decisión 8). No es "no pisar": es no escribir. Una celda vacía en
 * una columna manual significa que todavía nadie la cargó, y ese hueco es información.
 *
 * `Barrio` entró a la lista cuando el origen dejó de mandarlo (CLAUDE.md 3.3.b): hoy lo carga
 * una persona, así que es de ellos. Ojo con la consecuencia: la columna `AA (Comuna)` deriva
 * del barrio por fórmula, así que **la comuna del destino también depende de carga manual**.
 */
const COLUMNAS_MANUALES = [
  'Barrio', 'Inscriptos', 'Mail', 'Call Center', 'IVR', 'RRSS', 'Difusión'
];

/**
 * Las once columnas del destino que hoy son fórmulas de array en la celda del encabezado
 * (CLAUDE.md 3.1.b y decisión 9). Bloqueadas **por nombre**: nada de `getFormula()` dinámico,
 * que no detecta las celdas expandidas de un bloque de array.
 *
 * Después de la Fase 3 la lista no se borra: cambia de significado y pasa a ser "lo que calcula
 * `recalcDerivadas_()`". El upsert las sigue sin tocar.
 */
const COLUMNAS_DERIVADAS = [
  'Día de la semana', '% de Asistencia', 'Direccion2', 'Falta Informacion',
  'Comuna', 'Poblacion', 'p. Mujer', 'P. Varon', '(km2)', '(hab/km2)', 'Zona'
];

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

// ===================== Fechas =====================

/**
 * ⚠️ **OBSOLETA desde 2026-09-25: el ancla de fechas quedó descartada** (CLAUDE.md 3.3.c).
 * `detectFecha_` ya no la usa — devuelve las dos fechas y el matching las puntúa con tolerancia
 * (`BANDAS_FECHA`). Se conserva porque `diagAnclaFecha()` la referencia como registro de la
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
 *   ausencia (ni barrio ni comuna)             → no puntúa NI cuenta para el denominador
 *   desacuerdo (barrio o comuna distintos)     → descalifica: el candidato no se escribe solo
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
  fechaExacta:     0.30,
  fecha1Dia:       0.24,
  fecha3Dias:      0.15,
  fecha7Dias:      0.06,
  barrioIgual:     0.25,
  comunaSinBarrio: 0.15,
  hora:            0.10
};

/**
 * **La fecha es señal, no clave.** Escala decreciente y **ninguna banda descarta por sí sola**:
 * un desvío de 9 días puntúa 0 pero no elimina al candidato, porque la fecha no es confiable ni
 * en el origen ni en el destino (CLAUDE.md 3.3.c).
 *
 * El escalón de ±7 existe porque ahí vive casi todo el error medido: de los 223 comparables de
 * `diagFechaFin()`, sólo 4 tienen |d| > 7. Darle 0.06 en vez de 0 reconoce que "la misma semana"
 * aporta algo, sin que alcance para decidir nada por su cuenta.
 */
const BANDAS_FECHA = [
  { dias: 0, peso: PESOS_MATCH.fechaExacta },
  { dias: 1, peso: PESOS_MATCH.fecha1Dia },
  { dias: 3, peso: PESOS_MATCH.fecha3Dias },
  { dias: 7, peso: PESOS_MATCH.fecha7Dias }
];

/**
 * **PROVISORIOS.** Puestos a ojo, no medidos.
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
const UMBRAL_MATCH  = 0.75;
const MARGEN_MINIMO = 0.15;

/** Tolerancia para dar por coincidente la hora, en minutos. El texto libre rara vez es exacto. */
const TOLERANCIA_HORA_MIN = 30;

// ===================== B2: la lógica de negocio que hay que no perder =====================

/**
 * **Colapso de canales: 8 en el origen → 5 en el destino.**
 *
 * Es lógica de negocio real y confirmada, y hasta hoy **existía sólo adentro de
 * `syncB_to_B2`** ([Sync B to B2.js:117-121](Sync%20B%20to%20B2.js#L117)). Vive acá para que
 * reescribir B2 no se la lleve puesta.
 *
 * La clave es el nombre de la columna en `B` **sin** el prefijo `Inscriptos canal `.
 */
const MAPEO_CANALES = {
  'Mail':        ['Mailing'],
  'Call Center': ['Call Center'],
  'IVR':         ['IVR'],
  'RRSS':        ['Facebook', 'Google', 'Programmatic'],
  'Difusión':    ['Difusion', 'Otros']
};

/** El prefijo que llevan las columnas de canal en `B`. */
const PREFIJO_CANAL_B = 'Inscriptos canal ';

/**
 * **Escalado de sexo.** `B` trae `Inscriptos M` y `Inscriptos F` contados sobre
 * `Inscriptos unicos identificados`, que es menor que `Inscriptos`. B2 los lleva a proporción
 * del total ([Sync B to B2.js:166-169](Sync%20B%20to%20B2.js#L166)):
 *
 *     Masculinos = round(Inscriptos × Inscriptos M / Inscriptos unicos identificados)
 *     Femeninos  = round(Inscriptos × Inscriptos F / Inscriptos unicos identificados)
 *
 * Con `identificados = 0` no se escala nada: quedan vacíos, no en cero (CLAUDE.md 0.a).
 *
 * ⚠️ **No hay categoría X.** `B` sólo trae `M` y `F`. Si el origen empieza a mandar una
 * tercera, hoy no se lee y nadie se entera.
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
 * Prefijos administrativos que el origen antepone al nombre del evento y que hay que sacar
 * **antes** de buscar la figura. Si no, `VINCULO CIUDADANO - Clara Muzzio ...` puede matchear
 * contra una figura equivocada, o no matchear.
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
 * **Se escriben también cuando el score NO alcanzó.** Ahí `form_origen` guarda el mejor
 * candidato descartado y `form_nivel` el motivo. Un caso mal resuelto tiene que poder
 * auditarse sin volver a correr nada — y el día que aparezca una fuente de fecha mejor, se
 * puede reprocesar y comparar contra lo que se había decidido en vez de empezar de cero.
 *
 * `form_origen` va **literal, sin normalizar**: es la trazabilidad, no una clave.
 */
const COLUMNAS_TRAZA = [
  'RDV_UID', 'form_origen', 'form_score', 'form_nivel', 'form_fecha_match'
];

/** Solapa de propuestas de emparejamiento a mano (CLAUDE.md, decisión 2). */
const RDV_HOJA_EMPAREJAR = 'EMPAREJAR_MANUAL';

/**
 * Piso para **proponer** un par en `EMPAREJAR_MANUAL`. Deliberadamente bajo: el objetivo ahí no
 * es acertar sino no ofrecer un producto cartesiano. Un par se propone si comparte figura o si
 * cae en `VENTANA_EMPAREJAR_DIAS`; por debajo, no se propone nada.
 */
const PISO_EMPAREJAR = 0.30;
const VENTANA_EMPAREJAR_DIAS = 21;

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
