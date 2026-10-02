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
 * TEMPORAL 02/10 — revertir a 'RVD JM-CM - ES' (RDV_HOJA_DESTINO_REAL). Apunta a la copia
 * "AAA NOBORRAR" para probar la escritura en lote mientras el equipo trabaja en la solapa real
 * (docs/ESTADO.md, "Prueba de escritura sobre la copia"). Para volver: cambiar el valor, commit,
 * git push y clasp push. El activador no se instala hasta volver y verificar la escritura real.
 */
const RDV_HOJA_DESTINO   = 'AAA NOBORRAR';     // TEMPORAL 02/10 — revertir a 'RVD JM-CM - ES'
/**
 * El destino real. Sólo para la guarda (`verificarHojaDestino_`): si RDV_HOJA_DESTINO apunta a otra
 * solapa, sus encabezados tienen que ser exactamente los de ésta; si no, el upsert no corre.
 */
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

/**
 * La línea de base de los `#4F81BD`, **por solapa**, tomada ANTES de escribir con
 * `paso16_verificarEscritura()` (docs/backup.md §8.1, paso 6). La usa la verificación posterior: los
 * de las COLUMNAS_MANUALES no pueden subir. `null` = todavía no anotada.
 *
 * Por solapa (02/10): la copia de prueba tiene la suya, y la del destino real no se pisa.
 */
const LINEA_BASE_AZULES = {
  // 02/10 12:44, paso 16 OK, antes de la primera escritura real. Después de la corrida cortada de
  // las 14:50 (123 filas) el destino real quedó en 605 / 6368: los manuales no subieron.
  'RVD JM-CM - ES': { manuales: 605, total: 5749 },
  // La copia de prueba (TEMPORAL 02/10): paso 16 de las 16:59, antes de escribir en ella.
  'AAA NOBORRAR':   { manuales: 605, total: 6368 }
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
 * **Regla 3, dentro de una misma clave** (02/10): de dos formularios con el mismo nombre y el mismo
 * cierre, el que casi no tiene inscriptos no se hizo. Un formulario con hasta este número de
 * inscriptos, que comparte la clave con otro que tiene más, **se descarta** como candidato (no compite
 * por ninguna fila; el log lo lista). Si los que comparten la clave tienen todos más que esto, no hay
 * forma de saber cuál es: ninguno se escribe solo (`clave_repetida`, a revisión).
 *
 * Casos medidos: 1 contra 1344 (fila 708), 2 contra 72 (134), 0 contra 116 (Comuna 1 Sur - 3/9).
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
