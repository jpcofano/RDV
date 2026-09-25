# Prompt 03 — Cierre del diseño de matching

**Rama:** `migracion`
**Depende de:** `PROMPT-CODE.md` (Fase 0-1), `PROMPT-02-CORTE-B.md` (Fase 1b)
**Estado:** ejecutado el 2026-09-25

---

## Contexto: el diagnóstico terminó

`diagFechaFin()` cerró la última pregunta abierta. El resultado:

```
fecha_fin vs FECHA del destino:  56,5% en 0 o +1
desvíos grandes (|d| > 7):        4  ·  de esos, Reprogramada: 0
|d| <= 7 : Realizada 213 | Suspendida 5 | Reprogramada 1
|d| >  7 : Suspendida 2  | Realizada 2
```

**`fecha_fin` no es confiable**, y el número sale de una muestra sesgada hacia el caso bueno
(las 699 filas que matchean son justamente aquellas donde la clave natural funcionó).

Lo relevante no es el porcentaje sino **dónde está el error**: con sólo 4 desvíos grandes, la
mayor parte del 43,5% restante vive en desvíos de 2 a 7 días. Una ventana que los acepte a
todos acepta también cualquier otra reunión de esa figura en esa semana. **Ninguna ventana
discrimina.** El ancla de fechas queda descartada.

Y la hipótesis de reprogramación no explica nada: cero de los desvíos grandes son
`Reprogramada`.

### El estado real del proyecto

Los tres campos con los que el código armaba la clave están rotos o ausentes:

| campo | estado |
|---|---|
| barrio | ausente en `B` desde 2025-10 (0% → 54% → 93% → 97%) |
| fecha del nombre del formulario | no confiable (20 `fecha_mal_parseada`, rango inflado a 18/12/2026) |
| `fecha_fin` | no confiable (56,5%) |
| figura sola | no identifica |

**No hay clave natural.** Eso no es un riesgo: es el estado actual, y explica todo lo demás —
las 79 filas sin datos, las 14 claves duplicadas en B2, el hueco que crece mes a mes.

---

## 1. Documentar el cierre

En `CLAUDE.md` 3.3.c: **ancla de fechas descartada**, con el motivo (el error está en el medio,
no en los extremos; ninguna ventana discrimina). En 3.2: **no hay clave natural**, escrito como
estado y no como riesgo, con la tabla de arriba.

`RDV_UID` pasa de mejor opción a **única opción**. Subilo a la fase más temprana que permita
el plan.

### Verificación previa, antes de escribir código

`diagFechaFin()` no dice si aplicó `VENTANA_ANALISIS_MESES = 6`. El desglose por status suma
223 filas y no está claro si es la ventana o el total. Si el 56,5% salió del histórico completo,
está contaminado con el formulario viejo (anterior a 2025-10) y podría ser mejor de lo que parece.

- Confirmalo y, si hace falta, recalculá sólo sobre la ventana. Pasá los dos números.
- **Todos los diagnósticos** deben imprimir en primera línea: `filas en ventana / filas totales /
  fecha de corte`, y cada porcentaje debe decir sobre cuál de las dos se calcula. Un porcentaje
  sin denominador explícito es la cuarta falsa alarma esperando.

Pendiente de la corrida anterior: el mismo desvío para las filas de `DIAG_CORTE_B` con candidato
en `B` (muestra sin sesgo), y mirar los 4 desvíos grandes de a uno.

---

## 2. El diseño del matching, cerrado

**No hay bootstrap manual previo.** Nadie resuelve 103 filas antes de arrancar. El pipeline hace
lo que puede en cada corrida y deja registrado lo que no.

### 2.1 Se escribe con confianza, si no se deja

Score normalizado (`obtenido / alcanzable`), como ya está implementado. Sobre el umbral escribe
y estampa `RDV_UID`; debajo no escribe y registra.

**La fecha pasa a ser señal del score con tolerancia**, ya no componente duro de la clave.
Ajustá los pesos: fecha exacta, ±1, ±3 y ±7 puntúan en escala decreciente y **ninguna descarta
por sí sola**.

### 2.2 Trazabilidad: qué formulario se pasó

Columnas nuevas al final del destino, junto a `RDV_UID`:

```
RDV_UID | form_origen | form_score | form_nivel | form_fecha_match
```

- `form_origen`: el `Nombre` del evento de `B`, **literal, sin normalizar**. Es la trazabilidad.
- `form_nivel`: por qué señales matcheó.
- **Se escriben también cuando el score no alcanzó**: ahí `form_origen` guarda el mejor candidato
  descartado y `form_nivel` el motivo.

Un caso mal resuelto tiene que ser auditable sin volver a correr nada. Y con `form_origen`
guardado, el día que aparezca una fuente de fecha mejor se puede reprocesar y comparar contra
lo que se había decidido, en vez de empezar de cero.

### 2.3 Normalizaciones

En `02_Parsing.js`, todas las que hagan falta:

- barrios derivados de `Comunas` con `_expandirAbreviaturas_` (ya hecho)
- figuras derivadas de la columna `Figura` del destino, no de listas hardcodeadas
- comuna desde el texto (`detectComuna_`)
- **limpieza de prefijos** del nombre del evento antes de buscar figura: `VINCULO CIUDADANO -`,
  `JORGE MACRI -`, `POST -`, `NO USAR`
- **`NO USAR` marca un formulario anulado**: se marca y no se usa como candidato

### 2.4 `REVISAR_MATCH` deja de ser cola de trabajo

Pasa a ser un reporte: filas donde hubo candidato pero no alcanzó. Se mira cuando se quiera.
Confirmar una estampa el `RDV_UID`.

---

## 3. `EMPAREJAR_MANUAL` — el lado que falta

Todo lo que tenemos mira desde el destino hacia `B`. Falta el lado opuesto: formularios de `B`
que no se asociaron a ninguna fila. Con las dos listas juntas el problema se ve completo, y
muchas veces la solución es obvia — un formulario huérfano y una fila vacía que se corresponden.

**Que proponga sólo los pares con alguna razón de serlo**, no el cruce completo. Una lista de
103 contra 100 sin filtrar es un producto cartesiano y nadie la mira.

Usá el mismo score, con un piso bajo: se propone un par si comparte figura, o si cae dentro de
una ventana de fechas amplia. Por debajo, no se propone nada.

**Formato** — una fila por par propuesto:

```
nombre_formulario | inscriptos | Figura | Barrio | Fecha | score | señales | confirmar
```

- **Ordenado por score descendente**, no por fecha. Los pares más plausibles primero, que es
  como se trabaja una lista así.
- Si un formulario tiene varios candidatos razonables, **mostralos todos juntos y seguidos**,
  para que la persona elija entre ellos sin tener que buscarlos.
- Columna `confirmar` vacía. Cuando el pipeline la encuentra llena, estampa el `RDV_UID` en las
  dos puntas y esa fila no vuelve a aparecer.

**Dos bloques aparte al final:** formularios sin ningún candidato, y filas del destino sin ningún
candidato. Esos no se emparejan con nada y son la medida de lo que el sistema no puede resolver
ni con ayuda. Si ese bloque es grande, falta información que no está en ninguno de los dos lados,
y eso es una conversación con quien carga los formularios, no un problema de código.

**Exclusiones:** formularios marcados `NO USAR`, y filas del destino cuya reunión todavía no pasó
(no son hueco, son reuniones futuras).

---

## 4. Ejecutar

`20_UpsertDestino.js` en modo `DRY_RUN`: calcula scores, llena `REVISAR_MATCH`, `SIN_MATCH` y
`EMPAREJAR_MANUAL`, **y no escribe nada en el destino**. Los números de esa corrida calibran los
umbrales antes de habilitar escritura.

Recordá que toda escritura al destino pasa por `setSiDelSistema_` (sección 0) y que las once
`COLUMNAS_DERIVADAS` no se tocan hasta la Fase 3.
