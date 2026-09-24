/**
 * 05_Escritura.js — **el único archivo que escribe en el destino.**
 *
 * Está separado a propósito. Que toda escritura viva acá hace que la regla de la sección 0 de
 * `CLAUDE.md` sea verificable de un vistazo:
 *
 *     grep -rn "setValue\|setValues\|setBackground" *.js
 *
 * Si eso devuelve algo fuera de este archivo que apunte al destino, está mal.
 *
 * Dos funciones, y la segunda es una **excepción explícita** a la primera:
 *
 *   setSiDelSistema_(rango, valor)   la regla general: escribe sólo en celda vacía.
 *   marcarRealizada_(...)            la única excepción: una transición de estado.
 *
 * La excepción está **afuera** de `setSiDelSistema_`, no adentro. Meterla adentro la volvería
 * inauditable: la regla general dejaría de ser cierta y nadie lo vería leyendo el helper.
 *
 * **Todavía no está enganchado al pipeline.** Lo usa el upsert nuevo, en la Fase 5.
 */

// ===================== La regla general =====================

/**
 * Escribe `valor` en `rango` **sólo si la celda está vacía**, y pinta `#4F81BD`.
 *
 * Celda con cualquier valor → no se toca. No importa quién lo puso ni de qué color está
 * (CLAUDE.md 0). Alcanza con esto porque los números del sistema son cerrados: el formulario
 * cierra y el total no se actualiza, así que nunca hay un valor nuevo que quiera reemplazar al
 * que ya está.
 *
 * Devuelve `true` si escribió.
 */
function setSiDelSistema_(rango, valor) {
  const actual = rango.getValue();
  if (actual !== '' && actual !== null && String(actual).trim() !== '') return false;
  if (valor === '' || valor === null || valor === undefined) return false;

  rango.setValue(valor);
  rango.setBackground(AZUL_SISTEMA_);
  return true;
}

/** La marca de procedencia. Un solo lugar, para que no haya dos literales del mismo color. */
const AZUL_SISTEMA_ = '#4F81BD';

// ===================== La única excepción =====================

/**
 * Avanza `STATUS REUNIÓN` de `en agenda` a `Realizada` cuando la fila ya tiene asistentes.
 *
 * --- Por qué es una excepción, y por qué hace falta ---
 * `STATUS REUNIÓN` **no es un número cerrado: es un estado que cambia.** La regla general le
 * impediría avanzar, porque la celda ya tiene valor (`en agenda`). Sin excepción, una reunión
 * que efectivamente ocurrió se quedaría marcada como agendada para siempre.
 *
 * --- Qué tan angosta es ---
 * Una sola transición, en una sola dirección:
 *
 *   `en agenda` → `Realizada`, y **sólo** si hay asistentes cargados.
 *
 * Nunca al revés. Nunca hacia ningún otro valor. Y **nunca desde ningún otro estado**: la
 * whitelist es de un solo origen a propósito. "Cualquier estado que no sea Realizada" permitiría
 * pisar una reunión que alguien **suspendió o reprogramó a mano**, que es carga humana y está
 * protegida por el invariante. `Suspendida`, `Reprogramada` y `Se modifico el barrio` son
 * decisiones de una persona: el pipeline no las toca.
 *
 * Un estado que no esté en `STATUS_CONOCIDOS` tampoco se toca — si apareció algo nuevo, lo
 * primero es entender qué significa, no pisarlo.
 *
 * Pinta `#4F81BD` como cualquier otra escritura del sistema: el equipo tiene que poder ver de
 * un vistazo que ese "Realizada" lo puso el proceso y no una persona.
 *
 * @param {Range}  rangoStatus  la celda de STATUS REUNIÓN de la fila
 * @param {number} asistentes   los asistentes de esa fila (de A2 / RDV CONJUNTO, no de B2)
 * @return {boolean} true si avanzó el estado
 */
function marcarRealizada_(rangoStatus, asistentes) {
  const n = (typeof asistentes === 'number') ? asistentes : Number(asistentes);
  if (!(n >= MIN_ASISTENTES_REALIZADA)) return false;

  const actual = String(rangoStatus.getValue() == null ? '' : rangoStatus.getValue()).trim();

  // Ya está donde queremos: no reescribir (evita repintar y ensuciar la métrica de procedencia).
  if (normStatus_(actual) === normStatus_(TRANSICION_REALIZADA.hacia)) return false;

  // La whitelist: un solo estado de origen. Todo lo demás queda como está.
  if (normStatus_(actual) !== normStatus_(TRANSICION_REALIZADA.desde)) {
    // Un estado que no conocemos es una señal, no un caso borde: alguien empezó a usar algo
    // nuevo y el pipeline se está quedando viejo. Se avisa, no se toca.
    if (actual !== '' && !statusConocido_(actual)) {
      Logger.log('[escritura] STATUS desconocido, no se tocó: "%s"', actual);
    }
    return false;
  }

  rangoStatus.setValue(TRANSICION_REALIZADA.hacia);
  rangoStatus.setBackground(AZUL_SISTEMA_);
  return true;
}

/** Comparación de estados sin acentos, sin mayúsculas y sin espacios de más. */
function normStatus_(s) {
  return String(s == null ? '' : s)
    .normalize('NFD').replace(/[\u0300-\u036F]/g, '')
    .toLowerCase().replace(/\s+/g, ' ').trim();
}

/** ¿Es un estado que el pipeline conoce? Lo que no conoce, no lo toca. */
function statusConocido_(s) {
  const n = normStatus_(s);
  for (let i = 0; i < STATUS_CONOCIDOS.length; i++) {
    if (normStatus_(STATUS_CONOCIDOS[i]) === n) return true;
  }
  return false;
}
