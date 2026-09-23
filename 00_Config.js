/**
 * 00_Config.js — el único lugar del proyecto con literales.
 *
 * **Primer archivo de la arquitectura nueva** (CLAUDE.md 4). Todavía no lo usa el pipeline
 * legado: se adelantó porque `40_Alertas.js` lo necesita. El resto de sus constantes se suman
 * en la Fase 2, cuando se escriban `01_Utils.js`, `02_Parsing.js` y `05_Escritura.js`.
 *
 * Nada de acá pisa nombres del legado: el prefijo `RDV_` y los dos `COLUMNAS_*` son únicos en
 * el scope global compartido (CLAUDE.md 3.1.c).
 */

// ===================== Planillas =====================

const RDV_SS_DESTINO    = '1ZpHO6Ru1uY2r9WfBF_yFtu5z7ip7F3Q6VOoRJN5vLAo'; // (1) destino final
const RDV_SS_INTERMEDIA = '1dNLcBjh1ncEVBeALD-szhIlcRGkfOiMaPJp2tGqrsyM'; // (2) base intermedia
const RDV_SS_ORIGEN     = '1W7mzk0cTmiabfEMZ56M9pDsqf6jK6I2fDpqbpP3dWQg'; // (3) NO somos dueños
const RDV_SS_AGENDA     = '1hP8zMN8Ep7s1w9zb3Fllix2q_OqIhVwkrED0KCoVh4U'; // (4) Agenda

const RDV_HOJA_DESTINO = 'RVD JM-CM - ES';
const RDV_HOJA_B2      = 'B2';
const RDV_HOJA_A2      = 'A2';
const RDV_HOJA_ALERTAS = 'ALERTA_CAMBIOS';

const RDV_TZ = 'America/Argentina/Buenos_Aires';

// ===================== Columnas =====================

/**
 * Columnas que carga el equipo a mano. El pipeline **las lee y nunca las escribe, ni aunque
 * estén vacías** (CLAUDE.md, decisión 8). No es "no pisar": es no escribir. Una celda vacía en
 * una columna manual significa que todavía nadie la cargó, y ese hueco es información.
 */
const COLUMNAS_MANUALES = [
  'Inscriptos', 'Mail', 'Call Center', 'IVR', 'RRSS', 'Difusión'
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
