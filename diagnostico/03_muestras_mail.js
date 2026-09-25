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

  const salida = [['hilo', 'msg_en_hilo', 'total_en_hilo', 'fecha', 'asunto',
                   'plantilla', 'grupo', 'semana_desde', 'semana_hasta', 'de',
                   'largo_cuerpo', 'truncado', 'cuerpo']];

  const porMes = {};
  const plantillas = {};
  const grupos = {};
  const asuntosCrudos = {};
  const porHilo = {};
  let mensajes = 0, truncados = 0;

  for (let h = 0; h < hilos.length; h++) {
    const msgs = hilos[h].getMessages();
    porHilo[msgs.length] = (porHilo[msgs.length] || 0) + 1;
    for (let m = 0; m < msgs.length; m++) {
      const msg = msgs[m];
      const fecha = msg.getDate();
      const asunto = msg.getSubject() || '';
      const cuerpo = String(msg.getPlainBody() || '');
      const cortado = cuerpo.length > DIAG3_MAX_CUERPO;
      if (cortado) truncados++;

      const mes = Utilities.formatDate(fecha, RDV_TZ, 'yyyy-MM');
      porMes[mes] = (porMes[mes] || 0) + 1;

      const plantilla = _plantillaAsunto_diag3(asunto);
      plantillas[plantilla] = (plantillas[plantilla] || 0) + 1;
      asuntosCrudos[_sinPrefijos_diag3(asunto)] = true;

      const g = _grupoAsunto_diag3(asunto);
      if (g) grupos[g] = (grupos[g] || 0) + 1;
      const sem = _semanaAsunto_diag3(asunto);

      salida.push([
        h + 1, m + 1, msgs.length,
        Utilities.formatDate(fecha, RDV_TZ, 'yyyy-MM-dd HH:mm'),
        asunto, plantilla, g || '', sem.desde, sem.hasta,
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
  Logger.log('VENTANA: no aplica — se vuelca TODO el historial de Gmail a propósito. Los %% de');
  Logger.log('abajo son sobre los %s mensajes encontrados.', mensajes);
  Logger.log('Hilos: %s | mensajes: %s | truncados a %s caracteres: %s',
             hilos.length, mensajes, DIAG3_MAX_CUERPO, truncados);

  Logger.log('--- mensajes por mes ---');
  Object.keys(porMes).sort().forEach(function (k) {
    Logger.log('  %s : %s %s', k, porMes[k], barra_diag2(porMes[k], mensajes));
  });

  /*
   * Se agrupa por PLANTILLA, no por asunto crudo.
   *
   * El asunto lleva el rango de la semana —"Semana del 14/10 al 20/10"— así que cambia todas
   * las semanas, y contar asuntos crudos da más de cien "variantes" cuando en realidad hay una
   * sola forma con dos campos. Ésa es una falsa alarma justo del tipo que este diagnóstico
   * existe para evitar: reemplazar las fechas por un marcador deja ver la forma real.
   */
  const plClaves = Object.keys(plantillas).sort(function (a, b) {
    return plantillas[b] - plantillas[a];
  });
  Logger.log('--- plantillas de asunto (fechas reemplazadas por {DD/MM}) ---');
  plClaves.slice(0, 20).forEach(function (a) { Logger.log('  %s × "%s"', plantillas[a], a); });
  if (plClaves.length > 20) Logger.log('  ... y %s plantillas más', plClaves.length - 20);
  Logger.log('  (asuntos crudos distintos: %s — ese número NO es señal de nada por sí solo)',
             Object.keys(asuntosCrudos).length);

  const gClaves = Object.keys(grupos).sort(function (a, b) { return grupos[b] - grupos[a]; });
  if (gClaves.length) {
    Logger.log('--- valores del campo {GRUPO} del asunto ---');
    gClaves.forEach(function (g) { Logger.log('  %s × "%s"', grupos[g], g); });
  }

  if (plClaves.length > 3) {
    Logger.log('  >>> %s plantillas distintas. Mirar en qué mes aparece cada una: un cambio de ' +
               'PLANTILLA sí sería un corte silencioso de la ingesta. Un cambio de {GRUPO} o ' +
               'del rango semanal, no.', plClaves.length);
  } else {
    Logger.log('  La plantilla es estable: el asunto nunca cortó la ingesta.');
  }

  /*
   * Mensajes por hilo. El legado se queda SIEMPRE con el último del hilo. Si hay hilos largos,
   * esa elección hay que justificarla: la corrección puede venir en un mensaje del medio.
   */
  Logger.log('--- mensajes por hilo ---');
  const hClaves = Object.keys(porHilo).map(Number).sort(function (a, b) { return a - b; });
  hClaves.forEach(function (n) { Logger.log('  %s mensaje(s): %s hilos', n, porHilo[n]); });
  const maxHilo = hClaves.length ? hClaves[hClaves.length - 1] : 0;
  if (maxHilo > 1) {
    Logger.log('  >>> Hay hilos de hasta %s mensajes y el legado se queda con el ÚLTIMO. ' +
               'Verificar que sea el correcto: si la corrección vino en un mensaje del medio y ' +
               'después alguien respondió algo trivial, el último es el equivocado.', maxHilo);
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

/** El asunto sin `Re:` / `Fwd:` ni espacios de más. */
function _sinPrefijos_diag3(asunto) {
  return String(asunto || '')
    .replace(/^((re|rv|fwd|fw)\s*:\s*)+/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * La **plantilla** del asunto: lo anterior con cada fecha reemplazada por un marcador.
 *
 * Es lo que permite ver que cien asuntos distintos son en realidad una sola forma con el rango
 * de la semana variando. Contar asuntos crudos da una falsa alarma; contar plantillas, no.
 */
function _plantillaAsunto_diag3(asunto) {
  return _sinPrefijos_diag3(asunto)
    .replace(/\d{1,2}\/\d{1,2}(\/\d{2,4})?/g, '{DD/MM}')
    .replace(/\b(19|20)\d{2}\b/g, '{AAAA}')
    .replace(/\s+/g, ' ')
    .trim();
}

/** El campo variable del asunto: `... con {GRUPO} - Semana del ...`. */
function _grupoAsunto_diag3(asunto) {
  const m = /\bcon\s+(.+?)\s*[-–]\s*semana\s+del\b/i.exec(_sinPrefijos_diag3(asunto));
  return m ? m[1].trim() : '';
}

/**
 * El rango de la semana que viene en el asunto: `Semana del 14/10 al 20/10`.
 *
 * Se extrae del **asunto**, no del cuerpo — este archivo sigue sin parsear cuerpos. Vale la
 * pena tenerlo en columnas porque es una **restricción externa sobre las fechas de los
 * eventos**, independiente del nombre del formulario y de `fecha_fin`, que son los dos campos
 * que sabemos poco confiables (CLAUDE.md 3.3.c).
 */
function _semanaAsunto_diag3(asunto) {
  const re = /semana\s+del\s+(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)\s+al\s+(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)/i;
  const m = re.exec(_sinPrefijos_diag3(asunto));
  return m ? { desde: m[1], hasta: m[2] } : { desde: '', hasta: '' };
}

/** El valor del legado, sólo para el mensaje del log. */
const GMAIL_LOOKBACK_DAYS_LEGADO_DIAG3 = 21;
