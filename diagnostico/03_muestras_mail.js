/**
 * Preparación de la Fase 8 — juntar muestras de los mails de agenda.
 *
 * SÓLO LECTURA sobre Gmail. No parsea, no interpreta, no toca ninguna planilla salvo su propia
 * solapa `DIAG_MAILS` en la intermedia. **Corre a mano. No lleva activador.**
 *
 * --- Para qué ---
 * El rediseño de la ingesta (Fase 8) necesita saber cómo son los mails de verdad: cuántas
 * variantes de formato hay, qué tan estable es el asunto, si el cuerpo cambió de estructura en
 * algún momento. Eso no se puede contestar con el parser del legado, porque **el parser sólo ve
 * lo que ya sabe reconocer**: sus cuatro regex devuelven cero eventos cuando el formato cambia,
 * sin decir que cambió.
 *
 * Y hay un reloj corriendo: `agenda_syncFromEmails` mira **21 días hacia atrás**
 * (`GMAIL_LOOKBACK_DAYS`) y no deja marca de procesado. Nadie está guardando estos mails. Esta
 * función junta el material ahora, mientras el trabajo está en inscriptos, para que cuando
 * llegue la Fase 8 haya con qué.
 *
 * --- Qué hace y qué no ---
 * Vuelca **asunto, fecha y cuerpo en crudo**, truncado. Nada más. No aplica las regex del
 * legado a propósito: si las aplicara, las filas que no matchean —que son justo las que
 * interesan— saldrían vacías y no se sabría si es porque el mail es raro o porque el parser no
 * lo entiende.
 *
 * Usa `getPlainBody()`, que es la parte de texto plano que manda Gmail. No es parsear: es leer
 * la versión que el propio mail trae. Es más fiel que pasarle un regex al HTML, que es lo que
 * hace `stripHtml_` en el legado.
 */

// ===================== Configuración =====================

/**
 * La query, sin filtro de fecha. El legado le agrega `newer_than:21d`; acá se busca **todo el
 * historial** que Gmail devuelva, que es el punto del ejercicio.
 */
const DIAG3_QUERY = 'subject:(Agenda Encuentros de vecinos)';

/** Caracteres de cuerpo por fila. Una celda de Sheets aguanta 50.000; esto deja margen. */
const DIAG3_MAX_CUERPO = 8000;

/** Tope de hilos, por las dudas. Gmail pagina de a 500. */
const DIAG3_MAX_HILOS = 2000;

const DIAG3_SALIDA = 'DIAG_MAILS';

// ===================== Punto de entrada =====================

/** Vuelca los mails de agenda a `DIAG_MAILS`. Sólo lectura. Correr a mano. */
function diagMuestrasMail() {
  const t0 = new Date();

  const hilos = _buscarHilos_diag3();
  Logger.log('[diag3] query: "%s" → %s hilos', DIAG3_QUERY, hilos.length);
  if (!hilos.length) {
    Logger.log('>>> CERO hilos. O la query no matchea ningún asunto, o la cuenta que corre esto');
    Logger.log('    no es la que recibe los mails. Las dos cosas explicarían por qué la ingesta');
    Logger.log('    del legado "no encuentra eventos" sin tirar error.');
    return { hilos: 0, mensajes: 0 };
  }

  const salida = [['hilo', 'msg_en_hilo', 'total_en_hilo', 'fecha', 'asunto', 'de',
                   'largo_cuerpo', 'truncado', 'cuerpo']];

  const porMes = {};
  const asuntos = {};
  let mensajes = 0, truncados = 0;

  for (let h = 0; h < hilos.length; h++) {
    const msgs = hilos[h].getMessages();
    for (let m = 0; m < msgs.length; m++) {
      const msg = msgs[m];
      const fecha = msg.getDate();
      const asunto = msg.getSubject() || '';
      const cuerpo = String(msg.getPlainBody() || '');
      const cortado = cuerpo.length > DIAG3_MAX_CUERPO;
      if (cortado) truncados++;

      const mes = Utilities.formatDate(fecha, RDV_TZ, 'yyyy-MM');
      porMes[mes] = (porMes[mes] || 0) + 1;
      const aNorm = _asuntoNormalizado_diag3(asunto);
      asuntos[aNorm] = (asuntos[aNorm] || 0) + 1;

      salida.push([
        h + 1, m + 1, msgs.length,
        Utilities.formatDate(fecha, RDV_TZ, 'yyyy-MM-dd HH:mm'),
        asunto,
        String(msg.getFrom() || ''),
        cuerpo.length,
        cortado ? 'TRUE' : 'FALSE',
        cortado ? cuerpo.substring(0, DIAG3_MAX_CUERPO) : cuerpo
      ]);
      mensajes++;
    }
  }

  escribirHoja_diag(DIAG3_SALIDA, salida);

  Logger.log('=== DIAG_MAILS ===');
  Logger.log('Hilos: %s | mensajes: %s | truncados a %s caracteres: %s',
             hilos.length, mensajes, DIAG3_MAX_CUERPO, truncados);

  Logger.log('--- mensajes por mes ---');
  Object.keys(porMes).sort().forEach(function (k) {
    Logger.log('  %s : %s %s', k, porMes[k], barra_diag2(porMes[k], mensajes));
  });

  /*
   * Las variantes de asunto son la primera señal de si el formato cambió. Si hay una sola
   * variante en todo el historial, el asunto es estable y la query del legado sirve. Si hay
   * varias, hay un momento en el que el parser dejó de encontrar mails.
   */
  Logger.log('--- variantes de asunto (sin Re:/Fwd: ni espacios de más) ---');
  const claves = Object.keys(asuntos).sort(function (a, b) { return asuntos[b] - asuntos[a]; });
  claves.slice(0, 20).forEach(function (a) { Logger.log('  %s × "%s"', asuntos[a], a); });
  if (claves.length > 20) Logger.log('  ... y %s variantes más', claves.length - 20);
  if (claves.length > 1) {
    Logger.log('  >>> Hay %s variantes de asunto. Mirar en qué mes aparece cada una: un cambio ' +
               'de asunto es un corte silencioso de la ingesta.', claves.length);
  }

  const masViejo = salida.length > 1 ? salida[1][3] : '-';
  const masNuevo = salida.length > 1 ? salida[salida.length - 1][3] : '-';
  Logger.log('Rango cubierto: %s → %s', masViejo, masNuevo);
  Logger.log('La ingesta del legado sólo mira %s días hacia atrás. Todo lo anterior a eso ' +
             'existe únicamente acá.', GMAIL_LOOKBACK_DAYS_LEGADO_DIAG3);
  Logger.log('%s ms', new Date() - t0);

  return { hilos: hilos.length, mensajes: mensajes, variantesAsunto: claves.length };
}

// ===================== Internas =====================

/** Pagina la búsqueda: `GmailApp.search` devuelve de a 500 como máximo. */
function _buscarHilos_diag3() {
  const todos = [];
  const paso = 500;
  for (let inicio = 0; inicio < DIAG3_MAX_HILOS; inicio += paso) {
    const lote = GmailApp.search(DIAG3_QUERY, inicio, paso);
    if (!lote.length) break;
    for (let i = 0; i < lote.length; i++) todos.push(lote[i]);
    if (lote.length < paso) break;
  }
  return todos;
}

/** El asunto sin `Re:` / `Fwd:` ni espacios de más, para poder agrupar variantes. */
function _asuntoNormalizado_diag3(asunto) {
  return String(asunto || '')
    .replace(/^((re|rv|fwd|fw)\s*:\s*)+/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** El valor del legado, sólo para el mensaje del log. */
const GMAIL_LOOKBACK_DAYS_LEGADO_DIAG3 = 21;
