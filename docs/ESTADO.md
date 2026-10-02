# Estado de la migración — al 2026-10-01

Punto de retomada. **`CLAUDE.md` sigue siendo la fuente de verdad** sobre qué hace el sistema y
por qué; este archivo dice sólo **dónde quedamos y qué sigue**, para poder abrir el repo en otra
máquina y arrancar sin releer todo.

Rama: **`migracion`**. `main` queda intacto como referencia.

---

## 1. Lo primero, porque no está en git

**Nada de lo escrito en las últimas sesiones corrió todavía contra la planilla.** El código está
commiteado; el proyecto de Apps Script **no está actualizado**.

```
clasp show-file-status   # sólo appsscript.json, los .js de la raíz y diagnostico/ (ver .claspignore)
clasp push
```

El push **reemplaza el proyecto entero**: lo que está en `_archivo/` sale del scope global, que
es lo buscado. El único activador vivo (`syncAgendaSheetInBaseFromAgenda_2`) está en
`Solapa agenda base final.js`, que sí sube.

Y después, en el editor, abrir **[99_Correr.js](../99_Correr.js)** y correr en este orden:

| # | qué correr | llama a | qué hace | escribe? |
|---|---|---|---|---|
| 1 | `paso1_columnasDeTraza()` | `correrFase2b()` | agrega los encabezados de las 5 columnas de traza al final del destino | sí, sólo encabezados. **Ya corrió** (el destino tiene las cinco) |
| 2 | `paso2_upsertEnSeco()` | `correrEnSeco()` | el upsert completo en `DRY_RUN` | **no toca el destino**; escribe 3 solapas de reporte en la intermedia. Última: 30/09 14:19. **← PRÓXIMO (después de las 17)**: sin la guarda (t, eliminada), con la reubicación a revisión (v) y las opciones en los reportes (y) |
| 13 | `paso13_formulariosSinFila()` | `listarFormulariosSinFila()` | formularios sin fila: **canceladas o reubicadas**, informativo, en dos listas (decisión w, reglas 8 y 9) | **no escribe en ninguna planilla**; sólo log. **← después del 2** |
| 10 | `paso10_validarContraInscriptos()` | `medirValidacionInscriptos()` | calibración contra los inscriptos que hoy tiene el destino (decisión s), con la búsqueda inversa (u) y la medición de los formularios con `fecha_fin` | **no escribe en ninguna planilla**; sólo log. **No entra en ninguna decisión**. Última: 30/09 14:23. **← después del 13** |
| 11 | `paso11_desacuerdoUbicacion()` | `medirDesacuerdoUbicacion()` | reubicaciones: figura + fecha 0-1 con la ubicación en desacuerdo, y cuáles son sin ambigüedad (decisión v) | **no escribe en ninguna planilla**; sólo log. **← último** |
| 14 | `paso14_formulasDestino()` | `diagFormulasDestino()` | las once derivadas siguen siendo fórmula y muestran lo que dice `Comunas` (decisión x) | **no escribe en ninguna planilla**; sólo log |
| 12 | `paso12_explicarFormulario()` / `paso12_explicarFila()` | `explicarFormulario()` / `explicarFila()` | un caso, señal por señal; leen `CASO_A_EXPLICAR` (decisión w) | **no escribe en ninguna planilla**; sólo log. Cuando haga falta |
| 3 | `paso3_medirReglaDelMes()` | `diagCorteB()` | mide las `desfase_reprogramacion`: texto = `fecha_fin` y destino corrido 1-3 días | no toca el destino; escribe `DIAG_CORTE_B` |
| 6 | `paso6_medirFormulariosSinFigura()` | `medirFormulariosSinFigura()` | el tamaño de sacar la figura del denominador (decisión k) | sólo log. Corrió el 26/09 |
| 7 | `paso7_formulariosFaltantes()` | `diagFormulariosFaltantes()` | las filas sin formulario propio (decisión o) | sólo log. Corrió el 01/10 14:11: faltantes 2 \| 3 (antes 14 \| 16) |

Los pasos 8 y 9 ya corrieron y quedaron implementados (decisiones p y q); están en YA CORRIDOS
como `rehacer_medirVariantesSinFigura()` y `rehacer_medirDesempatePorEvidencia()`.

**Resultados del 30/09 14:19-14:23 (pasos 2 y 10), con el desempate por evidencia y el invariante
aplicados:**

| | resultado |
|---|---|
| paso 2 (ventana) | **277 \| 3 \| 25** — predicción 272-278 \| 2-8 \| ~24. Total: **746 \| 15 \| 44** |
| invariante | **11 choques resueltos en 3 vueltas; chequeo 0** → **deja de ser bloqueante** (decisión r) |
| desempate | 26 por señales, 9 por distancia, 2 por inscriptos. **La salvaguarda se acepta** (hoy no frenó ninguno) |
| `EMPAREJAR_MANUAL` | 19 pares en ventana, **1,7 por fila** |
| paso 10 (ventana) | **96,2% exacto (253 de 263)**, 2,7% ≤ 5%, **3 en "más"** (527, 748, 769) |
| desempates vs destino | **33 de 33** coinciden |
| choques vs destino | **8 de 9**. El que no: `RDV JM Velez Sarfield - 5/6` (33 ins), que no coincide con ninguna de sus dos filas (la 626 tiene 105) |

Del invariante: la **645** terminó en el `Temático Educación` (el destino tiene 498, sus
inscriptos); la **626** (Flores 04/06) perdió tres formularios en cascada y terminó en
`formulario_compartido`, que es lo correcto.

**Landerreche 03/09** con el `Comuna 1 Sur` de 116: **aceptado** (regla de negocio), atado a la
respuesta del equipo sobre la fila **769**.

### Resultados del 01/10 18:23 (`5f84cc1`) contra la predicción, y la regresión de la 801

Mismos datos que a las 18:04. Contra la predicción (284 → ≈ 285 | 9 → ≈ 18 | 16 → ≈ 7):

| (ventana \| total) | 18:23 |
|---|---|
| escribiría | **284 \| 753** |
| a revisar | **19 \| 43** — `multi_figura` 11 \| 22 · `ubicacion_en_desacuerdo` 5 \| 15 · `formulario_compartido` 3 \| 6 |
| sin match | **6 \| 13** — `sin_formulario_propio` 4 \| 6 · `score_bajo` 2 \| 7 |
| `sin_figura_por_ubicacion` | escribiría 15 \| 15 |
| paso 10 | exacto **261/268 (97,4%)** \| 674/730 (92,3%); desempates **35/35** \| 59/59; invariante **6/6**; `fecha_fin` **10 \| 27** confirmados, **0 negativos** |

- **✓ a revisar** y **✓ sin match**: las figuras por apellido mandaron a las LTP a revisión
  (`multi_figura`) y sacaron a las de Lombardi de `SIN_MATCH`;
- **✗ escribiría quedó en 284**: entró la 626 (ventana asimétrica ✓) y **salió la 801**.

**La regresión.** Fila 801, Gabino Tapia 24/09 Núñez. Su formulario propio, `VÍNCULO CIUDADANO -
Encuentro con vecinos sobre Seguridad - Comuna 13 - 24/9` (B 806, 0 días, score 1,0, 143 = 143 en
el paso 10), quedó empatado con `… comerciantes -Lombardi-Tapia-Piragine - Eje Norte - 22/9` (2
días, 1,0), que desde el 01/10 es `multi_figura` por apellido. El veto `multi_figura` se aplicaba
**antes** del desempate, y además el LTP —como "nombra la figura"— sacaba al de Seguridad (sin
figura) de la competencia. Resultado: REVISAR `multi_figura`, y el de Seguridad huérfano en el
paso 13 como "sin fila (posible cancelada)".

**Corregido (01/10 noche):** el veto se evalúa sobre el **ganador** del desempate por evidencia; un
`multi_figura` no saca de la competencia a un formulario sin figura. Si el multi_figura gana con
margen (la 716), sigue en revisión. Línea nueva en el paso 2: *"empates con un candidato
multi_figura: N | N — resueltos a favor de un formulario simple N | N, siguen en revisión N | N"*,
con la lista. **Probado en Node**: la 801 se escribe con el de Seguridad 24/9 (desempate por
distancia, 0 contra 2 días); la 716 sigue en revisión con LTP 29/7 como primera opción; una fila LTP
sola sigue en revisión.

**Predicción (ventana), antes de correr:** paso 2 → **escribiría 285, revisar 18, sin match 6**.
Paso 13 → **B fila 806** (Seguridad Comuna 13 24/9) sale de "sin fila"; **quedan 6** en ventana.
**`sin_figura_por_ubicacion` pasa de 15 | 15 a 16 | 16** (sólo la 801). Si sube más, es efecto del
cambio "un `multi_figura` no saca de carrera a otro formulario", y se revisa fila por fila.

**sin_formulario_propio subió de 2 a 4.** La línea de motivos del paso 2 ahora las lista una por
una y marca las que con la regla simétrica de antes (±3 para todos) tenían formulario propio —o
sea, las que antes eran `score_bajo`—. **Hipótesis, sin medir:** son las que cambió la ventana
asimétrica de `fecha_fin` (un cierre posterior a la reunión ya no cuenta como cercano). Lo dice la
próxima corrida.

**Paso 13 del 01/10 18:28:** las LTP salieron de "sin fila" ✓; "Primera Persona 12/8" marcada
**DUDOSO** ✓. Los casos nuevos para el equipo, en 1a.

### Resultados del 01/10 18:04–18:07 (`e921457`): línea base anterior

| | resultado | predicción |
|---|---|---|
| paso 2 (ventana) | **284 \| 9 \| 16** | 283-290 \| 10-16 \| 3-8 |
| invariante | **0** | 0 |
| decididas por el eje | **0** | 0 |
| `ubicacion_en_desacuerdo` | **6 \| 15** | ≈ 9 \| 27 |
| subzona de la Comuna 1 | **19 \| 32 pares coinciden** | 1/10 → Monserrat; 3/9 igual |
| paso 10 | **97,4% exacto** en ventana; desempates **35 de 35** | 769 fuera de "más" |
| paso 11 | sin ambigüedad **2 \| 4** | ≥ 5 en ventana |
| paso 13 | **Bereciartua `Comuna 6 - 29/7` como reemplazo** | ídem |
| `fecha_fin` (paso 10) | **100%** de las reuniones en o después del cierre; **p90 = +6** | — |

Lo que se apartó: **sin match 16** contra 3-8. La explicación está en la búsqueda inversa: **9
filas de la ventana** tienen su formulario a 0 días con los inscriptos exactos, pero el formulario
nombra a las figuras **sólo por apellido** (Lombardi-Tapia-Piragine) y el matcher no las reconocía
(punto 1 de abajo). Y **sin ambigüedad 2 | 4** quedó por debajo de lo previsto.

**Dos decisiones del usuario con esos números:**

- **las reubicaciones NO se escriben solas**: quedan en revisión con las opciones (decisión v);
- **la ventana asimétrica SÍ se implementa** para los formularios con fuente `fecha_fin` (decisión s).

**Predicciones para la próxima corrida (puntos 1 y 2), anotadas antes de correr** —paso 2 y paso
10, después de las 17—:

```
(ventana)            01/10 18:04     predicción
escribiría               284         ≈ 285       (+ la 626 por la ventana asimétrica; puede
                                                  sumar alguna más con fuente fecha_fin)
a revisar                  9         ≈ 18        (+ ≈ 9 multi_figura: los formularios de Lombardi
                                                  por apellido, como los históricos)
sin match                 16         ≈ 7
formularios con figura sólo por apellido (línea nueva del paso 2): los de Lombardi-Tapia-Piragine
  de la ventana (≈ 9) y del histórico; ninguno que no sea de una figura real
invariante                 0         0
```

- **paso 10**: el bloque de `fecha_fin` muestra la **626 como elegida** (`1 a 1 - Comuna 7`,
  105 = 105, +6 días), y la fila pasa a escribiría;
- **paso 13** (cuando se corra): las filas de Lombardi-Tapia-Piragine **salen de "sin fila"**;
  "Primera Persona 12/8 con Nicolás Vázquez" (425) sigue en "posible reemplazo" pero marcada
  **DUDOSO** (tiene más inscriptos que su "nuevo", `1 a 1 - 12/8 Parque Avellaneda`, 128).

La línea base anterior, 30/09 14:19: ventana **277 | 3 | 25**. La predicción con la guarda (≈ 267 |
13 | 25) no llegó a correrse (decisión t).

**Predicciones del 01/10 para `e921457`, anotadas antes de correr** (ya corridas: resultado arriba;
se dejan para comparar). Desde la línea base cambiaron cuatro cosas a la vez, así que son rangos y la confianza es
**baja** en el paso 2:

- `B` pasó a **825** formularios y la consulta de Lombardi se corrigió (paso 7: faltantes
  **14 → 2** en ventana): ≈ 12 filas que eran `sin_formulario_propio` ahora tienen formulario;
- la reubicación a revisión (v) saca de `SIN_MATCH` las filas con figura + fecha + comuna en
  desacuerdo: **≈ 9 | 27** (predicción del usuario);
- RDV se corrigió (Comuna 1 del 3/9) y la columna I quedó con **sólo los 18 ejes priorizados**
  (los 30 completados por comuna y los 12 `?` salieron);
- las **subzonas de la Comuna 1** deciden la ubicación (regla 10, decisión aa);
- se eliminó la guarda: la 748 vuelve a escribirse (113).

```
(ventana | total)   30/09 14:19        predicción próximo paso 2
escribiría          277 | 746          ≈ 283-290 | ≈ 755-765   (los formularios nuevos)
a revisar             3 |  15          ≈  10-16  | ≈  38-48    (≈ 9 | 27 ubicacion_en_desacuerdo)
sin match            25 |  44          ≈   3-8   | ≈   5-15
ubicacion_en_desacuerdo (motivo)       ≈ 9 | 27
decididas por el eje                   0         (menos barrios con eje: sólo los 18 priorizados)
subzona de la Comuna 1                 "Comuna 1 Sur - 1/10" → Monserrat (808); el 3/9 igual
                                       (Landerreche ← Sur, Tapia ← Norte)
2e                                     barrios con eje 18 | sin eje 30 | pendientes 0
invariante (bloque 0)                  0 formularios con 2+ filas
filas de hoy/ayer sin barrio           ≥ 2      (Retiro y Monserrat del 1/10, si siguen sin barrio)
```

- **paso 13**: en **posible reemplazo** al menos **Bereciartua `Comuna 6 - 29/7` (169)**; en **sin
  fila (posible cancelada)**, en ventana, ≈ 5: Mraida Comuna 3 20/7 y 22/7, Primera Persona 12/8,
  Sánchez Zinny San Cristóbal 8/4, Miguel Comuna 15 22/4 (si alguno resulta reemplazo, pasa de
  lista);
- **paso 10**: la 769 sale de la banda "más" (RDV corregido); la 748 también si RDV ya tiene 113.
  Banda "más" ≈ **1-2** (la 527). El bloque de `fecha_fin` lista la 626 (+6 días);
- **paso 11**: REVISAR por `ubicacion_en_desacuerdo` ≈ **9 | 27**; sin ambigüedad, al menos los 5
  de la ventana (587, 590, 592, 543, 716), y en ellos **inscriptos iguales al destino** (es como el
  equipo los describió).

Si el paso 2 se aleja mucho de los rangos, mirar antes de seguir.

La corrida del 26/09 17:44 (D-C y tope de 3): **241 | 39 | 24** en ventana, predicción 241 | 39 |
25; paso 10 del 26/09 17:51: 94,4% exacto (221 de 234), desempate 36 de 38.

La corrida del 26/09 16:45 (B con 807 formularios; 304 evaluables): 229 | 38 | 37 (score_bajo 23,
sin_formulario_propio 14).

La corrida anterior, del 26/09 14:21 (810 filas, ventana 310 / 304 evaluables): 223 | 30 | 51,
con las 51 = 25 sin formulario propio cerca + 18 con un formulario cercano sin figura (13 de la
serie de Seguridad) + 8 con su figura pero bajo el umbral.

Las anteriores, para la historia (totales, salvo donde dice ventana):

```
                  25/09 18:13   26/09 11:36
escribiría (total)       627          641
a revisar  (total)        68           85
sin match  (total)       107           76
2f figura_no_reconocida (ventana)   103 (37,3%)   92 (32,7%)
densidad EMPAREJAR_MANUAL           4,9           7,0
"ninguno a ±3" del 2b (ventana)      15            23
```

> ⚠️ **El 2f no cuenta filas que fallan**, y su categoría estaba mal rotulada. Cuenta filas cuyo
> formulario de comuna más cercano no fue el que ganó; muchas se escriben igual con otro. Y
> `figura_no_reconocida` era en realidad *"el formulario no nombra la figura de la fila"*.
> **Medido el 26/09 16:45 (ventana): `otra_figura` 73, `sin_figura` 16, `posible_grafia` 0**: el
> 32,7% era otra figura —otras reuniones de la misma comuna—, no una falla de reconocimiento
> (decisión l).

Las ventanas del log ya no son comparables con las de antes del 26/09 si no se corrigen por el
corte: la del 25/09 usaba 25/03 (base 307).

Ya corridos, en el bloque YA CORRIDOS de `99_Correr.js`: `rehacer_medirFiguraEnPrefijo()` (el
viejo paso 4, decisión i) y `rehacer_verificarLegToDate()` (el viejo paso 5, decisión j).

Si en el paso 2 falla la escritura de un reporte: `paso2_rehacer_revisarMatch()`,
`paso2_rehacer_emparejarManual()` o `paso2_rehacer_sinMatch()`, que rehacen sólo ése.

**`DRY_RUN = true` en [20_UpsertDestino.js](../20_UpsertDestino.js).** No se cambia hasta haber
leído los números de la corrida en seco.

> ✅ **Ya no es bloqueante: el invariante "un formulario, una fila".** El paso 2 del 30/09 14:19
> resolvió 11 choques en 3 vueltas y el chequeo del bloque 0 dio **0**. Se sigue chequeando en cada
> corrida; si algún día no da 0, el log lo dice en mayúsculas. Ver decisión r). Lo que falta para
> `DRY_RUN = false` está en la lista de abajo (1b).

> El pipeline legado está **frenado a propósito**: un solo activador vivo,
> `syncAgendaSheetInBaseFromAgenda_2`. Ver el recuadro de la sección 2 de `CLAUDE.md`. No
> encender nada sin leerlo.

---

## 1a. Consultas al equipo (al 01/10 noche)

**Para el equipo (nuevas, del paso 13 del 01/10 18:28):**

- **Flores 29/1** contra **CCV Versalles 29/1**: marcado **DUDOSO**; probablemente dos reuniones.
- **1 a 1 Villa Riachuelo 11/8** contra **Parque Avellaneda 12/8**: posible reubicación.
- **Mraida Comuna 3 20/7 y 22/7**: sin fila, los dos con más de 100 inscriptos.
- ~~**Ejes**: el paso 2 cuenta 19 barrios con eje y se esperaban 18~~ → **CERRADA (01/10)**: el
  equipo confirmó la lista y ya está pegada en `Comunas` columna I. **18 barrios con eje:**

  | eje | barrios |
  |---|---|
  | Centro | Balvanera, Caballito |
  | Norte | Belgrano, Núñez, Palermo, Recoleta, Retiro, Villa Urquiza |
  | Oeste | Chacarita, La Paternal, Parque Chacabuco, Villa Devoto |
  | Sur | Barracas, Boedo, Flores, La Boca, Parque Patricios |
  | Este | San Nicolás |

  Contra la provisoria de 19 (Centro: Balvanera, Caballito, Almagro, Boedo · Este: San Nicolás ·
  Norte: Villa Urquiza, Belgrano, Recoleta, Palermo, Retiro, Núñez · Oeste: Parque Chacabuco, Villa
  Ortúzar, Chacarita, La Boca · Sur: Parque Patricios, Constitución, Barracas, Floresta): salen
  Almagro, Constitución, Floresta y Villa Ortúzar; entran Flores, La Paternal y Villa Devoto; La
  Boca pasa de Oeste a Sur; Boedo de Centro a Sur (el equipo puso "Sur | Centro"; quedó "Sur").
  En el código (01/10): la celda se lee recortada ("Sur " → "Sur") y con **varios ejes separados
  por `|`** coincide cualquiera, por si el equipo vuelve a poner Boedo con los dos.

**Cerradas el 01/10:**

| caso | respuesta | qué cambia |
|---|---|---|
| **748** (Tapia Villa Real 20/08, destino 6) | **RDV tenía el error; vale 113** | el matcher ya elige el de 113, y el sistema escribe 113. La guarda que la frenaba se eliminó (t) |
| **Comuna 1 del 3/9** (769 Tapia Retiro) | **RDV corregido** | la 769 sale de la banda "más" del paso 10. **Landerreche 768**: el match con `Comuna 1 Sur - 3/9` es correcto |
| **Bereciartua 29/7** | **reunión reubicada** | la fila **714** (Flores) se escribe con `Comuna 7 - 29/7` (185); `Comuna 6 - 29/7` (169) es el **formulario viejo** de la misma reunión. No era un typo ni un faltante |
| **(5)** comuna del formulario ≠ barrio de RDV (587, 590, 592, 543, 716 + 380, 393, 425, 443, 468, 247) | **reuniones reubicadas que no se actualizaron de un lado** | **regla 8 confirmada** (CLAUDE.md 1). El dato vigente es el barrio de RDV. Implementado: van a revisión, nunca se escriben solos (v). La medición "sin ambigüedad" sigue en pie para decidir cuáles se escribirían solos |
| **(4)** formularios con inscriptos sin fila en RDV | **probablemente reuniones canceladas** (o reubicadas) | **regla 9**: no es un faltante a reclamar. El paso 13 pasa a "formularios sin fila: canceladas o reubicadas", informativo (w) |
| **(7)** ejes dudosos | **son ejes PRIORIZADOS: sólo 18 barrios tienen eje** | los otros 30 no pertenecen a ningún eje: celda **vacía** (= no pertenece, no pendiente). El usuario corrigió la columna I: sacó los 30 completados por comuna y los 12 `?`. **No hay pendientes**; el `?` queda sólo como posibilidad (g). ~~Los 12 propuestos quedan definitivos~~ (corregido el mismo 01/10) |
| subzonas de la **Comuna 1** | **Norte = Puerto Madero, Retiro, San Nicolás; Sur = Constitución, Monserrat, San Telmo** | no son ejes; deciden la ubicación de los formularios "Comuna 1 Norte/Sur" (regla 10, decisión aa) |
| **Lombardi 2026** | **consulta de `Hoja1` corregida** | **verificado** con el paso 7 (01/10 14:11, `B` con 825 formularios): faltantes **14 \| 16 → 2 \| 3** (decisión o) |

Los 2 faltantes que quedan en ventana —**Sánchez Zinny 19/06 Caballito** y **Muzzio 28/08
Recoleta**— tienen el formulario de su figura tomado por otra fila, a 7 y 14 días: posibles
reubicaciones o filas duplicadas en RDV, no faltantes de la consulta. Quedan anotados; con la regla
9 no hay consulta abierta por ellos.

~~**Regla operativa (01/10): el match del día corre después de las 17.**~~ **Reemplazada el 02/10**:
el activador corre **cada 1 hora**, y lo que protege a las filas del día es **`pendiente_barrio`**
(una fila de hoy o de ayer sin barrio en RDV no se escribe y se reevalúa en la corrida siguiente;
ver 1b). Los formularios se cierran y los barrios de RDV se cargan a lo largo del día. `Comuna 1 Sur
- 1/10` (125) calzaba con dos filas del 1/10 (Retiro y Monserrat): con los barrios cargados, la
**subzona** (regla 10) la manda a **Monserrat (808)** —Sur— y deja a Retiro en desacuerdo.

---

## 1b. Lista para pasar a `DRY_RUN = false`

**`DRY_RUN` lo cambia el usuario, no el código ni Claude.** Esto es la lista de lo que tiene que
estar en verde antes, y el orden de la primera escritura real. Nada de esto está hecho todavía.

### Resultados del 02/10 10:56 (`5ecaa4a`): **línea base vigente**

Ventana **285 | 18 | 7** contra la predicción **285 | 18 | 6**. La diferencia es la **fila 811**
(Quirós, Villa Devoto, 02/10): la reunión de hoy, con el formulario todavía sin importar. **La 801 se
escribe** ✓; empates con `multi_figura` resueltos a favor de un formulario simple **4** (664, 694,
762, 801); `sin_figura_por_ubicacion` **16 | 16** ✓; ejes **18 / 30** ✓; "perderían por el eje"
**1 | 1** ✓; invariante **0** ✓.

### 02/10: B ordenado, activador cada hora, `pendiente_barrio`, y el pase a `DRY_RUN = false`

**B va a quedar ordenado por `fecha_fin`** (SORT sobre el IMPORTRANGE): los formularios cambian de
fila. Revisado qué dependía de la posición en B (CLAUDE.md, decisión 3):

| | ¿dependía? | cómo quedó |
|---|---|---|
| `RDV_UID` y columnas de traza | no se guardan por fila de B. **Pero** una fila con `RDV_UID` no volvía a encontrar su formulario y lo dejaba libre para otra fila en la corrida siguiente | se encuentra por la traza (`form_origen` + fecha más cercana, `formularioDeTraza_`) y queda reservado; el chequeo del invariante cuenta esas filas |
| `elegido` de EMPAREJAR_MANUAL | todavía no se lee | cuando se lea, por `op{n}_formulario` (Nombre), nunca por `op{n}_fila_B` |
| desempate entre empates exactos | **sí**: "a igual score, el primero visto" = orden de B | formularios ordenados por **clave estable** antes de evaluar (`ordenarFormularios_`) |
| invariante | dentro de una corrida, consistente (B no cambia en medio) | igual; entre corridas, ver la primera fila |

**La clave estable del formulario es `claveFormulario_`: `normalizeText_(Nombre) | AAAAMMDD(Fecha_Fin)`**
(decisión 3 de CLAUDE.md), con inscriptos y fila sólo para desempatar formularios
indistinguibles. **Probado en Node:** con B invertido y renumerado, el plan da **cero diferencias**.

**El activador corre cada 1 hora**, no a las 18:00 (preparado, **no instalado**: `99_Pipeline.js`):

- sin la restricción de "no antes de las 17";
- **regla nueva `pendiente_barrio`** (`PENDIENTE_BARRIO_RECIENTE`): una fila de **hoy o de ayer sin
  barrio** que se escribiría o iría a revisión **no se escribe**; veredicto propio, se reevalúa en
  la corrida siguiente, no entra a los reportes ni a EMPAREJAR. Una fila sin match sigue como hoy;
- **`LockService`**: dos corridas no se pisan (la segunda no hace nada y lo loguea);
- **`REGISTRO_UPSERT`** (intermedia): una línea por corrida con hora, modo, filas y celdas
  escritas, uids, escribiría, pendientes, a revisar y sin match `[ventana | total]`.

**Predicciones para la próxima corrida, anotadas antes de correr (02/10):**

- **con B ordenado, el paso 2 da exactamente los mismos números que con B sin ordenar** (por
  construcción: el resultado ya no depende del orden);
- contra las 10:56 (285 | 18 | 7) puede moverse por dos cosas, y sólo por ésas: la **811** pasa a
  escribiría si ya llegó su formulario, y las filas de hoy o de ayer **sin barrio** que se
  escribirían o irían a revisión pasan a **`pendiente_barrio`** (línea nueva en el paso 2, y la
  línea fija de "filas de hoy o de ayer sin barrio" dice cuáles).

**El pase a `DRY_RUN = false` (punto 3): NO hecho.** El pedido lo condiciona al backup hecho, y el
link quedó en blanco (`link: ______`). `DRY_RUN` sigue en `true` hasta que el usuario pase el link
de la copia (docs/backup.md §8.1).

- **Qué se corre para la primera escritura:** `upsertDestino()` (en `20_UpsertDestino.js`), **a
  mano, una vez**, con `DRY_RUN = false`. No hay wrapper `pasoN_` a propósito: es la única función
  que escribe en el destino.
- **Qué escribe:** en el destino, por `setSiDelSistema_` (sólo celdas **vacías**, pintadas
  `#4F81BD`), en las filas con veredicto `escribiria` y en las que ya tienen `RDV_UID`: sexo y
  edades (`Masculinos`, `Femeninos`, `18-24` … `66+`, `Sin identificar`), `RDV_UID` y la traza
  (`form_origen`, `form_score`, `form_nivel`, `form_fecha_match`); y `STATUS REUNIÓN` `en agenda` →
  `Realizada` donde hay asistentes (`marcarRealizada_`, la única excepción). **Nunca** las
  `COLUMNAS_MANUALES` ni las derivadas. Las filas a revisar, sin match o `pendiente_barrio` no se
  tocan. En la intermedia: los tres reportes y una línea en `REGISTRO_UPSERT`.
- **Verificación después de escribir: `paso16_verificarEscritura()`** (`diagnostico/08`): invariante
  en el destino (ningún formulario en 2+ filas con `RDV_UID`), el paso 14, los azules de las
  `COLUMNAS_MANUALES` contra la línea de base (no pueden subir) y las filas con `RDV_UID` (todas con
  `form_origen`). **Correrlo también ANTES de escribir** y anotar los dos totales de azules en
  `00_Config.js` (`LINEA_BASE_AZULES_MANUALES` / `_TOTAL`): es la línea de base.

**Lo que queda antes de la primera escritura real (al 02/10):**

1. **Paso 2 con B ordenado y las reglas nuevas** (pendiente_barrio), contra la predicción de arriba.
2. **Backup** según [docs/backup.md](backup.md) §8 (el mismo día, justo antes), con el **link** en
   ESTADO.
3. **Línea de base de azules**: `paso16_verificarEscritura()` antes de escribir; los dos totales a
   `00_Config.js`.
4. **Invariante en 0** en el bloque 0 del paso 2.
5. **El usuario revisa `REVISAR_MATCH` con las opciones** (`paso15_resumenParaRevisar()`).
6. Con el link: `DRY_RUN = false`, push y clasp push; `upsertDestino()` una vez;
   `paso16_verificarEscritura()` hasta que dé OK. El activador (cada hora) se instala después, si
   el usuario lo decide.

Predicciones del 01/10 noche (corridas el 02/10 10:56; resultado arriba):

*Para comparar:* —con el veto
`multi_figura` sobre el ganador y los 18 ejes confirmados—:

| paso | predicción (ventana) |
|---|---|
| 2 | **285 \| 18 \| 6**; `sin_figura_por_ubicacion` **16 \| 16**; ejes **18 / 30**; "perderían a su ganador por el eje" **1 \| 1** (la 613); decididas por el eje **0** |
| 10 | desempates **36 / 36** |
| 13 | la fila **806** de B sale de "sin fila"; **quedan 6** en la ventana |

El detalle, como lista de chequeo:

**Antes (todo en verde, o no se pasa):**

- [ ] **Puntos 1 y 2 del 01/10 verificados** con el paso 2 y el paso 10 (arriba).
- [ ] **`REVISAR_MATCH` revisada por el usuario**, con las opciones y sus puntajes.
- [ ] **Backup completo** según [docs/backup.md](backup.md): copias de (1), (2) y (4) con fecha;
      el **texto** de las once fórmulas en `docs/formulas-legado.md`; foto de `Comunas` **A:I**
      (ahora incluye la columna I del eje); los números de control; el conteo de `#4F81BD` de hoy.
- [ ] **`clasp push` desde Rdv** y `clasp show-file-status` sin diferencias con el commit.
- [ ] **Activadores**: sigue habiendo uno solo vivo (`syncAgendaSheetInBaseFromAgenda_2`), y
      ninguno apunta a `upsertDestino` ([docs/triggers-legado.md](triggers-legado.md)).
- [ ] **`paso14_formulasDestino()`** da `CONFIRMADO`: las once derivadas conservan su fórmula y
      muestran lo que dice `Comunas`.
- [ ] **Invariante en 0**: el bloque 0 del paso 2 dice 0 formularios con 2+ filas escritas.
- [ ] **El paso 2 cerca de la predicción** (arriba).
- [ ] **El paso 10 revisado**: la banda "más" y la búsqueda inversa miradas caso por caso.
      **Ya no hay guarda**: lo que el paso 10 marque como dudoso y se escriba, se escribe.
- [ ] **Las `ubicacion_en_desacuerdo` vistas**: no se escriben solas; quedan en revisión.
- [ ] **El grep del invariante**: `grep -rn "setValue\|setValues" 20_UpsertDestino.js` da sólo
      `escribirHoja_` (intermedia).
- [ ] **Después de las 17**, por la regla operativa (1a).

**La primera escritura, en este orden:**

1. El usuario pone `DRY_RUN = false` en `20_UpsertDestino.js`; `clasp push`.
2. En el editor, **a mano y después de las 17**, `upsertDestino()` **una sola vez**. El log dice
   cuántas celdas y cuántos `RDV_UID` escribió.
3. Sugerido: volver a `DRY_RUN = true` y `clasp push` hasta terminar la verificación.
4. Verificar:
   - `paso14_formulasDestino()` sigue dando `CONFIRMADO` (ninguna derivada se rompió);
   - `rehacer_diagProcedencia()`: los `#4F81BD` de las `COLUMNAS_MANUALES` **no subieron** (el
     upsert no las escribe nunca);
   - `paso2_upsertEnSeco()`: las que se escribieron ahora entran **por `RDV_UID`**, y el resto
     queda igual.

**A saber antes de la primera escritura:** una fila que **no** se escribe no se toca —ni
`RDV_UID`, ni datos, ni traza— (decisión z). Su motivo y su mejor candidato están en
`REVISAR_MATCH` / `SIN_MATCH`, que se recalculan en cada corrida. La traza del destino es sólo de
las filas escritas.

---

## 2. Qué hay que mirar de esa corrida, y qué decide cada número

Son varias decisiones pendientes, todas esperando el mismo log. **Ninguna se toma sin el número
delante**; están descritas en `CLAUDE.md` con su razonamiento completo.

### a) ¿El umbral 0,88 sigue valiendo?

Bloque **`barrido de umbral`** del log. El 0,88 salió del valle de la distribución **histórica**,
que mezcla el formulario viejo con el de ahora. `_logValle_()` recalcula la meseta **sobre la
ventana de 6 meses** y dice una de tres cosas:

- cae adentro → no tocar nada;
- cae afuera → el log propone el medio de la meseta medida. Cambiar `UMBRAL_MATCH` en
  [00_Config.js](../00_Config.js) **y anotar el número al lado**;
- el barrido no calibra → la población está toda de un lado. No inventar un corte.

### b) ~~¿Se enciende `EVENTO_COMO_UBICACION`?~~ CERRADA: no

El bloque 2d dio que `EVENTO` coincide con **718 de 802** filas (`Encuentro con Vecinos`): es una
categoría, no un identificador. Queda en `false` y **se sacó de la puerta de
`EMPAREJAR_MANUAL`**, donde había subido la densidad de 2,6 a 8,2 pares por fila.

### c) ~~¿La regla del mes resolvió las `fecha_mal_parseada`?~~ Reinterpretada

Resolvió **0 de 20**, y no porque fallara: **no eran de mes**. Texto y `fecha_fin` coinciden y el
destino está corrido 1-3 días — **desfase por reprogramación**. Se renombraron
`desfase_reprogramacion` y el arreglo fue la escala: hasta ±3 días puntúa como coincidencia plena
(`TOLERANCIA_REPROGRAMACION_DIAS`). `diagCorteB()` ahora lo mide: "texto y fecha_fin caen el
mismo día" y "el destino está corrido 1-3 días". Lo esperable son casi todas en las dos.

En el upsert, la línea *"de las que escribiría, a 1-3 días"* del bloque 1 dice cuántas entran
gracias a la tolerancia.

### d) ¿Qué es el "lejos" del grupo bajo?

Bloque **2b**, *"desvío REAL del mejor candidato"* y *"¿había algún formulario a ±3 días?"*. La
corrida anterior dio ±1: 0, ±3: 8, **lejos: 50**; si el desfase típico es de 1 a 3 días, esas 50
no son reprogramación. Tres poblaciones:

- **con su figura reconocida** → el problema no es la fecha: mirar ubicación u hora;
- **sin ninguna figura reconocida** → probable: el formulario es el suyo pero `figurasEnTexto_`
  no encontró el nombre, y uno lejano que sí lo nombra le ganó. El log lista los casos;
- **ninguno** → el formulario no está en `B` con esa fecha. Otra población, otro arreglo.

### e) ¿Por qué no entran las de comuna coincidente?

Bloque **2f**. Las 65 `deberia_haber_entrado` son las de comuna, y **en `diagCorteB()` esa
categoría ya implica fecha exacta** —así que la fecha no es la sospechosa principal. El bloque
toma el formulario de la misma comuna más cercano en fecha y dice por qué no entró. ~~Si domina
`figura_no_reconocida_en_el_formulario`, el arreglo es cómo `figurasEnTexto_` reconoce nombres.~~
Corregido: esa categoría era mayormente **otra figura**, no reconocimiento (decisión l). El
reconocimiento sólo explica lo que caiga en `posible_grafia`.

### f) Huérfanos y densidad de `EMPAREJAR_MANUAL`

Bloque **3**. La puerta es `figura Y (fecha±21 O comuna)` —sin evento—. La **densidad** tiene
que volver a 2-4 pares por fila (con el evento había subido a 8,2). Si pasa de 5 el log avisa.

### g) ¿Se enciende `EJE_COMO_UBICACION`? — ahora con el mapeo del equipo

~~¿La `Zona` de `Comunas` es el eje?~~ No lo era (25/09: sin `Oeste`, descartaba el 82,5% de los
pares de la ventana). **Desde el 29/09 el mapeo está en `Comunas`, columna I, `Eje geográfico`**:
18 barrios los definió el equipo, 30 se completaron por comuna, y **12 están pendientes**, con el
valor terminado en `?` (Villa Crespo; la Comuna 10 entera; Liniers; Monserrat, San Telmo, Puerto
Madero y Constitución). La columna H (`Zona`) no se usa para el eje.

**Convención del `?`:** pendiente = eje no evaluable (no puntúa ni descalifica). Cuando el equipo
confirma un barrio, borra el `?` en la celda y el código lo toma solo, sin tocar el repo.

Bloque **2e** del paso 2:

- **a)** el encabezado de la columna I (si no dice `Eje geográfico`, el eje no se evalúa y lo
  avisa), los barrios de cada eje, y los pendientes aparte;
- **b)** los pares formulario con eje × fila del destino: coincide / **descartaría** / no
  evaluable, con el 82,5% del 25/09 al lado para comparar, y **una línea aparte para los
  pendientes** —"coincidiría N / descartaría M"— para que el equipo sepa qué está confirmando;
- la lista de los **"descartaría" a 0-3 días**, ventana primero: son los que más importan,
  porque descartar ahí es perder un match correcto.

~~`EJE_COMO_UBICACION` sigue en `false`. Se enciende si el descarte baja mucho respecto del 82,5%
y la lista de 0-3 días no tiene matches correctos.~~

**🔴 CERRADA (30/09): `EJE_COMO_UBICACION = false` es una DECISIÓN, no un pendiente.** El 2e del
29/09 13:08, con la columna I, dio "descartaría 66,4%" (antes 82,5%), pero ese porcentaje cuenta
todos los pares figura + fecha ±21, que en su mayoría no son la reunión correcta. Mirando cada
temático contra su fila a 0-1 días, **el eje descartaría matches CORRECTOS**:

- fila **645** (Macri 16/06 Almagro, eje Centro) ← `Temático Educación - Eje Oeste`: el destino
  tiene 498, los inscriptos de ese temático (paso 10);
- fila **613** (Macri 28/05 Balvanera, eje Centro) ← `Ciudad Atractiva 28/5 - Eje Este`;
- fila **665** (Macri 25/06 Monserrat, `Este?`) ← `Ciudad Atractiva / Cultura - Eje Sur`, si se
  confirmara.

**Hipótesis:** la tabla del equipo es de sedes donde se hacen los temáticos de cada eje, no una
partición barrio → eje (tiene barrios repetidos). Y el desempate por evidencia ya resuelve los
casos que el eje venía a resolver.

La columna I y la convención del `?` **se quedan**. El 2e ahora mide primero **cuántas filas
perderían a su ganador actual (o el del desempate) por el eje**, con los casos —la única cifra que
dice si el eje hace daño—; el % de pares queda como dato secundario.

**El eje queda SÓLO como último desempate (30/09, `EJE_COMO_DESEMPATE = true`).** Cuarto criterio
de `_desempatePorEvidencia_`, después de señales, distancia e inscriptos del formulario: gana el
contendiente cuyo eje coincide con el del barrio de la fila, **sólo si exactamente uno coincide**.
Eje distinto, vacío o `?` = neutro. **Nunca entra al score ni al margen, y nunca descalifica.**
Respeta la salvaguarda del desempate (umbral propio, no `multi_figura`). Traza:
`+desempate_por_eje`. El paso 2 tiene una línea fija con cuántas filas decidió: **se espera 0**
(los tres criterios anteriores ya resuelven todo lo que se vio). Si da más de 0, mirar esas filas
con `paso12_explicarFila()` antes de confiar.

**Ejes PRIORIZADOS (01/10, dato del equipo):** sólo **18 barrios tienen eje**, los que definió el
equipo. Los otros 30 **no pertenecen a ningún eje**: la celda va **vacía**, y vacío = "no
pertenece", no "pendiente". **No se completa por comuna** —lo habíamos hecho y era un error— y **no
hay pendientes**: el usuario sacó de la columna I los 30 completados y los 12 `?`. La convención
del `?` queda sólo como posibilidad. El eje sigue siendo **sólo último desempate**. El 2e dice
"barrios con eje 18 | sin eje 30". (Lo que se anotó un rato antes —"los 12 quedan definitivos"—
quedó corregido.)

### h) ¿Los formularios temáticos tienen alguna reunión cerca?

Bloque **2e**, punto c). Para cada formulario temático, si hay **alguna** fila de su figura a
±3 días. Los que no tienen ninguna se listan uno por uno: **son huérfanos reales**, y ningún
peso de ubicación los salva. El caso a mirar primero es **B fila 730** (Eje Sur, 14/08), cuyos
cuatro candidatos están a 7, 7, 11 y 13 días.

### i) ~~¿`limpiarPrefijos_` se saca, se acota o se conserva?~~ CERRADA: sale de la figura

`rehacer_medirFiguraEnPrefijo()` corrió el **25/09 20:18** (280 formularios en ventana / 776
vivos), comparando las figuras con y sin la limpieza:

```
EVITA multi_figura   0 |  0     ← el único beneficio posible (por construcción)
sigue multi_figura   0 |  0
PIERDE la figura    18 | 41     ← una sola forma: Jorge Macri → ninguna
otro                 0 |  0
```

**El beneficio para la figura es cero, también en el histórico.** `figurasEnTexto_` pasó a buscar
sobre el texto completo, como el legado.

- **No se tocó** `limpiarPrefijos_` en los demás usos: `leerCandidatos_` sigue detectando barrio,
  comuna, eje, temática, hora y fecha sobre el texto limpio, y `diagScores()` la usa para la
  fecha. Ahí **sigue siendo una hipótesis sin medir**.
- **Corregido respecto de la versión anterior:** se había anotado como hipótesis que `PIERDE`
  explicaría "buena parte del 37,3%" del 2f. **18 formularios difícilmente explican 103 filas**
  —y además el 37,3% nunca fueron "filas que fallan" (decisión l). El 26/09, con el cambio, el
  2f bajó de 103 a 92 en ventana.
  Cuánto aportan lo dirá el paso 2 (comparar contra la línea base de la sección 1); **el resto no
  tiene causa medida**, y las variantes de grafía son candidata, sin medir.

### j) ~~¿La copia de `legToDate_` que gana afecta al activador de Agenda?~~ CERRADA: no, hoy no

`rehacer_verificarLegToDate()` corrió el **25/09 23:26**:

- gana una copia **día primero** (A2/Upset): `'03/04/2026'` → `03/04`, el `Date` de las 15:30 →
  `12:00`;
- a la línea 72 **no le llega ningún `string`**: `Fecha (manual)` está vacía en las 5 filas, y lo
  que llega son 4 `Date` de `Fecha (auto)`. Con `Date` las tres copias dan el mismo día.

El pendiente queda **latente** en CLAUDE.md: hace falta que un push cambie el orden de carga y
gane la copia de B2 **y** que alguien tipee una fecha como texto. El arreglo (las tres copias día
primero) va, a más tardar, en la Fase 9. Rehacer la medición si cambia el orden de los archivos
o si empieza a cargarse `Fecha (manual)`.

### k) ¿Cuánto movería sacar la figura del denominador para los formularios sin figura?

Log de **`paso6_medirFormulariosSinFigura()`**. El formato de 09/2026 —`VÍNCULO CIUDADANO -
Encuentro con vecinos sobre Seguridad - Comuna X - d/m`— no nombra a nadie (CLAUDE.md 3.3): 14 en
ventana, todos sin candidato. Hoy lo mejor que dan es fecha + comuna sobre figura + fecha +
comuna = 0,56. Tres bloques:

1. **cuántos hay y de qué forma**, con la comuna y la fecha normalizadas antes de agrupar;
2. **filas de su misma comuna** (barrio → comuna) a 0 días y a ±3: exactamente 1 es el caso
   limpio, 2 o más necesita otra señal, ninguna es huérfano. Con el veredicto de hoy de esas
   filas;
3. **la otra cara, el costo**: simulando `obtenido / (alcanzable − 0,35)` sólo para estos
   formularios, cuántas filas que hoy se escriben con otro formulario tendrían un empate o un
   rival que las mande a revisión; y cuántas que hoy no se escriben llegarían al umbral.

**No es el resultado del cambio: es su tamaño.** No se tocaron pesos, puertas ni `puntuar_`. Si
se decide el cambio, el resultado lo dice volver a correr el paso 2 con él hecho.

### l) El 2f: ¿cuántas de las "no entran" fallan de verdad?

Bloque **2f** del paso 2. Ahora trae un **cruce motivo × veredicto de la fila** y la línea
*"De las N donde el más cercano no ganó, M son filas que IGUAL SE ESCRIBEN"*. Las que fallan de
verdad son las columnas *revisar* y *sin match*. Los ejemplos listados son sólo de filas que no
se escriben, ventana primero.

**Y el rótulo cambió:** `figura_no_reconocida_en_el_formulario` era *"el formulario no nombra la
figura de la fila"*, que no es una falla de reconocimiento. Se separa en **`otra_figura`**
(otra reunión de la misma comuna: Lombardi 30/03 ← un formulario de Landerreche), **`sin_figura`**
y **`posible_grafia`** (algún apellido de la figura está en el nombre). La suma de las tres es el
número viejo; el log la muestra para comparar. Mirar cuánto pesa `posible_grafia`: es la única
que apunta al reconocimiento de nombres.

**Medido (26/09 16:45, ventana): `otra_figura` 73, `sin_figura` 16, `posible_grafia` 0.** La
grafía no pesa en la ventana; afecta sólo al histórico. Cerrada.

### m) ¿De dónde sale la densidad de `EMPAREJAR_MANUAL`? (4,9 → 7,0) — medido: Jorge Macri

**Jorge Macri tiene 328 de 346 pares en ventana** (10,3 por fila); el resto está entre 1,3 y 3,3.
El bloque 3 sigue contando cuántos pares existen **sólo porque la figura sale del prefijo** (la
hipótesis de por qué subió), y ahora **simula un tope de 3 pares por fila**: cuántos se cortan,
la densidad que queda, cuántas filas quedarían con 0 pares (tendría que ser ninguna) y cuántos
formularios se quedarían sin propuesta. Orden para elegir: score, después cercanía de fecha.

**Fijado: `MAX_PARES_POR_FILA = 3`**, con una garantía. Simulado sin ella (26/09), la densidad
bajaba de 11,0 a 2,6 y ninguna fila quedaba vacía, pero **5 formularios se quedaban sin ninguna
propuesta**. Regla: tope de 3 por fila, pero un formulario al que el tope dejaría sin ningún par
**conserva su mejor par** aunque exceda el tope de esa fila. El bloque 3 lista esos formularios
con el par que conservan, y la densidad final. Es la lista de propuestas: **no cambia ningún
veredicto**.

### n) ¿Por qué "ninguno a ±3" pasó de 15 a 23?

Bloque **2b** del paso 2. "ninguno" se cuenta igual que antes (para poder comparar) y se
desglosa en *con un formulario a ±3 de OTRA figura* y *sin ningún formulario*, con la lista de
las filas (fecha, figura, barrio). Hipótesis, sin medir: los `JORGE MACRI - ...` que antes eran
"sin figura" ahora son "de otra figura" para filas de otras personas. Parte puede ser población:
entre las dos corridas el corte se movió; desde ahora está fijo (`VENTANA_ANALISIS_DESDE`).

### o) Las filas sin formulario propio: ¿faltan o están mal fechados?

**Toda reunión tiene formulario** (confirmado el 26/09; CLAUDE.md 1). Las filas "ninguno" del
2b —25 en ventana en la última corrida— no son reuniones sin formulario: son formularios que
faltan o que están mal fechados. En el upsert ahora llevan el motivo **`sin_formulario_propio`**
en `SIN_MATCH`, separado de `score_bajo`; el veredicto no cambia.

Log de **`paso7_formulariosFaltantes()`**, en tres partes:

- **a)** para cada fila, el formulario de su figura más cercano **a cualquier distancia**. Si
  coincide barrio o comuna y no es ya de otra fila → **candidato a mal fechado**, con la fecha
  detectada, de dónde salió (texto o `fecha_fin`) y el nombre crudo. Es una sospecha, no un hecho;
- **b)** `B` contra `Hoja1` por nombre normalizado + `fecha_fin`. Si no hay nada en `Hoja1` que
  falte en `B`, el faltante está **en la consulta**, no en el IMPORTRANGE;
- **c)** lo que queda: la lista de **FORMULARIOS FALTANTES** (fecha, figura, barrio, comuna),
  ventana primero y por fecha. Es lo que se le pasa a quien mantiene la consulta.

Las filas con la reunión hace menos de 7 días salen marcadas como **posible "todavía no
importado"** —las 2 de Jorge Macri del 29/09 son el caso—: volver a mirarlas en unos días antes
de reclamarlas.

**CERRADO el 01/10: Lombardi.** La consulta de `Hoja1` se corrigió y el paso 7 (01/10 14:11,
`B` con 825 formularios) lo verificó: faltantes **14 | 16 → 2 | 3**. Los 2 de la ventana
(Sánchez Zinny 19/06 Caballito, Muzzio 28/08 Recoleta) tienen el formulario de su figura tomado por
otra fila a 7 y 14 días: posibles reubicaciones o filas duplicadas en RDV, no faltantes de la
consulta (1a).

### p) ~~¿Qué variante del cambio "sin figura" rescata sin costo?~~ CERRADA: D-C, implementada

`paso8_…` corrió el **26/09 16:46** (hoy en YA CORRIDOS como `rehacer_medirVariantesSinFigura()`).
El paso 6 había dado que sacar la figura del denominador para los formularios sin figura sirve
(13 filas SIN_MATCH de la serie de Seguridad; 11 de 14 formularios con exactamente 1 fila de su
comuna a 0 días) pero cuesta (6 | 40 filas escritas empatadas o superadas). Las variantes:

| variante | regla | resultado (ventana) |
|---|---|---|
| 0 | el paso 6 tal cual | el costo de arriba |
| A | ubicación coincidente obligatoria (barrio o comuna) + fecha ±3 | — |
| B | A + fecha exacta | — |
| C | A + fecha ±1 | — |
| D-B | B + desempate | — |
| **D-C** | **C + desempate** | **12 de 14 objetivos recuperados, costo 0 \| 0; 1 a revisión** |

(De A, B, C y D-B tengo sólo la regla: los números no vinieron en el resumen.)

**La decisión: D-C, implementada** detrás de `SIN_FIGURA_POR_UBICACION = true` (`00_Config.js`;
CLAUDE.md decisión 2). La fila que va a revisión es Landerreche 03/09, con dos
`Comuna 1 Sur - 3/9` (0 y 116 inscriptos): **es lo correcto**, no hay con qué elegir entre dos
formularios iguales. La traza lleva `sin_figura_por_ubicacion` en `form_nivel`.

Probado en Node con los casos del paso 8: Sabor 31/08, Tapia Retiro 03/09, Mraida 16/09 y
Baistrocchi 08/09 se siguen escribiendo con su formulario; `"Gustavo Arengo 26/7"` (sin
ubicación) no puntúa por la regla; Landerreche 03/09 va a revisión; Piñeiro 03/09 se recupera.

### q) ~~¿El desempate por evidencia elige bien?~~ CERRADA: implementado

Log de **`paso9_medirDesempatePorEvidencia()`**. Muchas de las 38 REVISAR_MATCH de la ventana
son Jorge Macri con dos candidatos a 1,0: el `"1 a 1"` (figura + fecha exacta + comuna) contra
un temático `EJE Oeste/Norte` o `Primera Persona` (figura + fecha a 1 día, ubicación no
evaluable). **El `"1 a 1"` es la reunión de Macri** (confirmado; CLAUDE.md 3.3), pero la
normalización los deja iguales.

Sobre los contendientes de cada `margen_chico` —los que quedan a menos de `MARGEN_MINIMO` del
mejor—, el orden simulado es:

1. más señales evaluadas **y** coincidentes (figura, fecha, ubicación, hora; la fecha cuenta si
   está dentro de ±3);
2. menor distancia en días;
3. **más inscriptos del formulario** (hasta el 26/09: inscriptos > 0). Nunca los del destino.

Gana sólo el **estrictamente** mejor en el primer criterio que lo distinga; si empatan en los
tres, sigue en revisión. El log da, en [ventana | total], cuántas se resolverían y por qué
criterio, cuántas siguen (con los casos), y **todos los resueltos** con ganador, rivales y el
porqué. Mirar primero *"ganador = OTRO"*: son las filas donde el desempate le da la fila a un
formulario que hoy no es el mejor por score.

**No se implementa sin que una persona confirme los resueltos.** Aparte, se listan los
formularios con 0 inscriptos que hoy ganan una fila (Mercedes Miguel, `Comuna 9 15/9` → Miguel
15/09 Liniers), sin tocarlos.

**Corrió el 26/09 17:06: 37 de 38 resueltas** (27 por señales, 10 por distancia). Después:

- el criterio 3 pasó a **más inscriptos del formulario** (regla de negocio: de dos formularios de
  una misma reunión, el que casi no tiene inscriptos no se hizo). Debería resolver la fila 708
  (`Primera Persona 27/7`, 1344 contra su duplicado `DEPORTES` con 1) y la 134 (Tapia Saavedra
  21/8, 72 contra 2);
- cada resuelto dice si el ganador es **el mejor de hoy** u **"OTRO"**;
- se listan aparte los formularios **"Genérico"** (`Jorge Macri - Genérico 2026`, 774 ins) y las
  filas que ganan o disputan: no está claro que un genérico deba matchear.

**Implementado (30/09), detrás de `DESEMPATE_POR_EVIDENCIA = true`**, con los números del
26/09 17:44-17:51: 39 de 39 resueltas, y coincidencia con los inscriptos del destino en 36 de 38
(de las 2 que no, una la arregla el invariante y la otra tiene destino 0). El ganador tiene que
llegar al umbral por sí mismo y no ser `multi_figura`; si empatan en los tres criterios, la fila
sigue en REVISAR por margen_chico. La traza lleva `+desempate_por_<criterio>`. El orden vive en
una sola función, `_desempatePorEvidencia_`, que usan también el invariante de r) y el paso 10.

### r) ~~El invariante "un formulario, una fila" — bloqueante~~ CERRADA: chequeo 0 (30/09 14:19)

**Implementado el 30/09** (`aplicarFormularioUnico_`, entre las dos vueltas de `calcularPlan_`,
después del desempate). Si un formulario lo ganan 2+ filas, se lo queda la de mejor evidencia
(`_desempatePorEvidencia_`); las otras se **re-evalúan sin él con las mismas reglas** (umbral,
margen, sin figura por ubicación, desempate); si su nuevo mejor también está tomado, se repite,
hasta que no haya choques o se llegue a `MAX_VUELTAS_FORMULARIO_UNICO` (10). Sin un ganador claro
→ REVISAR_MATCH por `formulario_compartido`. Los inscriptos del destino no entran.

El bloque **0** del log pasó de simulación a **chequeo**: dice qué resolvió (se quedan / toman
otro / a revisar, con los casos) y, sobre el resultado final, cuántos formularios siguen con 2+
filas escritas. **Tiene que dar 0**; si no, lo dice en mayúsculas.

Probado en Node con los casos del paso 9: la **648** se queda con `1 a 1 - Comuna 5 17/6` y la
**645** termina en `Encuentro Temático Educación - Eje Oeste`; Ricardes `Comuna 9 29/6` → **671**
(no la 669); Muzzio `11/9 Recoleta` → **785** (no la 778). **Deja de ser bloqueante cuando el
chequeo del próximo paso 2 dé 0.**

**Dio 0 el 30/09 14:19**: 11 choques resueltos en 3 vueltas. La 645 terminó en el `Temático
Educación`; la 626 (Flores 04/06) perdió tres formularios en cascada y terminó en
`formulario_compartido`, que es lo correcto. En el paso 10, **8 de 9** choques coinciden con el
destino; el que no es `RDV JM Velez Sarfield - 5/6` (33 ins), que no coincide con ninguna de sus
dos filas (la 626 tiene 105) — lo mira la búsqueda inversa (u).

### s) ¿Qué tan bien acierta el matcher contra los inscriptos que hoy tiene el destino?

Log de **`paso10_validarContraInscriptos()`**. **Es una calibración de una sola vez**: los
inscriptos que hoy tiene el destino no van a existir en régimen como dato independiente (los
escribe el propio sistema), así que **no entran en el score, ni en ningún desempate, ni en la
regla de r)**. Mide:

- **cobertura**: filas evaluables con inscriptos cargados;
- **las que se escribirían**: destino contra el formulario elegido, en bandas (exacto / ≤ 5% /
  ≤ 20% / más), con la lista de las diferencias grandes —candidatas a match equivocado—;
- **los resueltos del paso 9**: si el ganador coincide con el destino o un rival coincide mejor,
  con los desacuerdos listados;
- **los choques de r)**: qué fila coincide con los inscriptos del formulario, y si la regla
  simulada eligió esa.

Lo que no dice, y está en el log: las filas que el legado cargó desde el mismo formulario
coinciden por construcción (valida al matcher nuevo contra el viejo, no contra la verdad); las
filas sin inscriptos no aportan; y una diferencia chica puede ser inscriptos que crecieron después
de la carga, no un error.

**Corrió el 26/09 17:51: 94,4% exacto en ventana (221 de 234); el desempate coincide con el
destino en 36 de 38.** Cambios desde entonces:

- **un destino con 0 inscriptos es "sin cargar", no una diferencia**: va en su propia línea y
  sale de la banda "más". En los choques, un formulario con 0 que "coincide" con un destino 0 no
  cuenta;
- los desempates y los choques que valida son los **implementados** (leídos del plan), no una
  simulación.

**El destino no es verdad absoluta** (CLAUDE.md): la fila 769 (Tapia Retiro 3/9) tenía 116 —los
inscriptos de `Comuna 1 Sur - 3/9`— y el matcher le asigna `Tapia - Comuna 1 Norte - 3/9` (88); la
748 (Tapia Villa Real 20/08) tiene 6 contra un formulario de 113. **Cerradas el 01/10** (1a): en la
748 RDV tenía el error y vale 113; la Comuna 1 del 3/9 se corrigió en RDV.

**Corrió el 30/09 14:23: 96,2% exacto en ventana (253 de 263), 2,7% ≤ 5%, 3 en "más" (527, 748,
769). Desempates 33 de 33. Choques 8 de 9.**

Se vuelve a correr después del próximo paso 2, ahora **con la búsqueda inversa** (u) al final y
con la medición de los **formularios sin fecha en el texto** (01/10): usan `fecha_fin`, el cierre
de la inscripción, que cae **antes** de la reunión (caso: fila 626 Flores 04/06 ↔ `1 a 1 - Comuna
7`, 105 = 105, a 6 días). Sobre los pares confirmados por la calibración —inscriptos iguales, con
`MIN_INSCRIPTOS_CALIBRACION_FECHA_FIN` (10) o más para no contar casualidades— mide (fecha de la
fila − `fecha_fin`) día por día. Si en la ventana es sistemáticamente ≥ 0 (≥ 80% de al menos 5
casos), **propone** una tolerancia asimétrica `[0, p90]` para esos formularios. No implementa nada.

**Medido el 01/10 18:04: el 100% de las reuniones confirmadas cae en o después del cierre, p90 =
+6. Decisión del usuario: se implementa** (`FECHA_FIN_ASIMETRICA = true`, `FECHA_FIN_VENTANA =
[0, +6]`). Para los formularios con fuente `fecha_fin`: pleno de 0 a +6 días, **cero hacia atrás**,
y más allá de +6 la escala de siempre. Traza `fecha_fin+N`. Los formularios con fecha en el texto
no cambian. Probado en Node: la 626 (Flores 04/06) se escribe con `1 a 1 - Comuna 7` (cierre a
+6), y un cierre posterior a la reunión puntúa 0 en fecha. Predicción: el bloque de `fecha_fin`
del próximo paso 10 muestra la 626 como elegida.

### t) ~~La guarda de transición: `TRANSICION_RESPETAR_DESTINO`~~ — ELIMINADA (01/10)

> **Decisión del usuario (01/10): se eliminó del código** —la constante, el bloque de
> `calcularPlan_`, el motivo `difiere_del_destino` y su línea del paso 2—, no sólo se apagó. Los
> inscriptos del destino son **sólo validación; nunca señal, desempate ni guarda** (CLAUDE.md 1):
> el sistema no va a tener ese dato. La 748, su caso, la cerró el equipo (vale 113) y se escribe.
> Revisado: el destino no entra en ningún otro punto del flujo de escritura (`_insDestino_` sólo
> lo leen el paso 10, el paso 11 y `explicarFila`, que sólo loguean). La predicción ≈ 10 | 59 no
> llegó a medirse. Lo de abajo queda como registro.

**Regla de transición, no del matcher.** Sólo para filas con veredicto `escribiria`: si el destino
tiene inscriptos cargados (≠ 0) y son **distintos** de los del formulario elegido, **no se
escribe**: va a REVISAR_MATCH con motivo `difiere_del_destino`, con los dos valores en la columna
de nivel (`… | destino N vs formulario M`). Igual o sin cargar → se escribe como siempre.

- **No toca el matching**: la elección ya está hecha cuando la guarda mira. Los inscriptos del
  destino siguen fuera del score, de los desempates y del invariante (CLAUDE.md 1). Es la única
  lectura de ese dato fuera del paso 10, y es para **decidir si se escribe**, no qué.
- **Es un seguro de migración**: la primera escritura no pisa (en el desagregado) una fila que el
  legado cargó con otro número, que puede ser el correcto (769, 748). **Se apaga después del
  backfill.**
- El paso 2 muestra cuántas frena `[ventana | total]` —**se espera ≈ 10 | 59**— con los casos. El
  paso 10 las sigue contando en sus bandas: lo que valida es la elección.

### u) La búsqueda inversa del paso 10 — implementada (30/09), sólo calibración

Para cada fila dudosa —la banda "más", los choques resueltos al revés, los desempates donde un
rival coincide mejor, las que no se escriben con dato en el destino, y las de
`FILAS_BUSQUEDA_INVERSA` (527, 626, 631; la 748 y la 769 salieron el 01/10, cerradas)—, los formularios **de su figura** (o sin
figura) a ±`DIAS_BUSQUEDA_INVERSA` (7) con **exactamente** los inscriptos del destino: *"el
destino tiene N: coincide con este formulario"*, y si ese formulario es el elegido, está libre o ya
lo toma otra fila.

**Sólo log; no entra en el score.** Un número igual puede ser casualidad, sobre todo con números
chicos: propone dónde mirar.

### v) Ubicación en desacuerdo con figura y fecha coincidentes — reubicación: implementada a revisión (01/10)

Caso: **Bereciartua**, fila 29/07/2026 **Flores (Comuna 7)**, 185 ins, contra *"VÍNCULO CIUDADANO -
Encuentro con vecinos - Pablo Bereciartua - Comuna 6 - 29/7"* (169). Figura y fecha exactas; la
comuna distinta lo **descalifica**. Hoy, si la fila tiene **cualquier** otro candidato limpio, el
descalificado ni siquiera llega a REVISAR (sólo va si es lo único que hay).

`paso11_desacuerdoUbicacion()` mide:

- **a)** los pares figura + fecha a 0-1 días + ubicación en desacuerdo, `[ventana | total]`, con
  los casos: en qué quedó la fila (¿ya se escribe con otro formulario?) y si el par está hoy en
  `EMPAREJAR_MANUAL`;
- **b) la propuesta, simulada y NO implementada**: esos pares no se descartan; si la fila no tiene
  un ganador mejor → REVISAR_MATCH con motivo `ubicacion_en_desacuerdo`; el par aparece siempre en
  `EMPAREJAR_MANUAL`; **nunca se escribe solo**. Cuenta cuántas filas y pares cambiarían.

**Corrección (01/10):** la fila de Bereciartua 29/07 es la **714** (Flores) y **se escribe** con
`Comuna 7 - 29/7` (185). `Comuna 6 - 29/7` (169) es el **formulario viejo** de la misma reunión,
que se reubicó: no hay ningún 185 contra 169 que resolver, y no es un faltante.

**Regla 8, confirmada por el equipo (01/10):** figura + fecha + inscriptos iguales + comuna
distinta en el título = **reunión reubicada que no se actualizó de un lado**. El dato vigente es el
barrio de RDV. Casos: 587 ↔ `Comuna 3 13/5` (250), 590 ↔ `Comuna 7 - 14/05` (119), 592 ↔
`Comuna 6 - 14/5` (92), 543 ↔ `Comuna 1 - 20/4` (236), 716 ↔ `Comuna 13 - 30/7` (147); en el
histórico 380, 393, 425, 443, 468 y 247.

**Implementado (01/10), `UBICACION_DESACUERDO_A_REVISION = true`:** el par figura + fecha a
±`DIAS_REUBICACION` (1) + ubicación en desacuerdo **no se descarta**. Si la fila no tiene un
ganador mejor → REVISAR_MATCH con motivo `ubicacion_en_desacuerdo` y el texto *"form dice Comuna
N / RDV dice Barrio (Comuna M) — posible reubicación"*; el par aparece **siempre** en
`EMPAREJAR_MANUAL` (el tope no lo corta). **Nunca se escribe solo.** Arreglado lo que encontró la
medición: el descalificado llega a revisión **aunque la fila tenga candidatos más flojos**.
**Predicción, antes de correr: ≈ 9 | 27 filas a revisar por este motivo.**

**La medición 2b sigue en pie** (`paso11_desacuerdoUbicacion()`, bloque b): de esos pares, cuántos
son **sin ambigüedad** —la figura tiene un solo formulario ese día ±1, y la fila un solo candidato
con figura y fecha (±7)— y cuántos ambiguos, `[ventana | total]` con los casos; y de los sin
ambigüedad, cuántos tienen inscriptos del formulario iguales a los del destino (calibración). Con
esos números el usuario decide si los sin ambigüedad se escriben solos con traza
`posible_reubicacion`.

**Medido el 01/10 18:04: `ubicacion_en_desacuerdo` 6 | 15 (predicción ≈ 9 | 27); sin ambigüedad
2 | 4. Decisión del usuario: NO se escriben solas.** Quedan en revisión, con las opciones y sus
puntajes (decisión y), y las resuelve una persona.

### w) Herramientas para revisar casos uno por uno — `diagnostico/06_revisar_casos.js`

Sólo lectura, sólo log.

- **`explicarFormulario`** (`paso12_explicarFormulario()`): fecha detectada y su fuente (texto o
  `fecha_fin`, y las ocurrencias que descartó la regla del mes), figuras, barrio, comuna, eje,
  inscriptos, y **todas** las filas de su figura a ±21 días con el score señal por señal, si quedó
  descalificado y por qué, y si pasó la puerta de `EMPAREJAR_MANUAL` (y si no, por qué: fila ya
  resuelta, formulario tomado, no nombra la figura, fecha lejos sin comuna, bajo el piso, o el tope).
- **`explicarFila`** (`paso12_explicarFila()`): lo mismo desde la fila, más su veredicto, su
  traza, sus contendientes y cómo ganó.
- Los dos leen **`CASO_A_EXPLICAR`** en `99_Correr.js`: número de fila de B o texto del nombre
  (formulario), o número de fila del destino (fila).
- **`listarFormulariosSinFila`** (`paso13_formulariosSinFila()`, antes `listarFilasFaltantes`):
  **"formularios sin fila: canceladas o reubicadas"**, **informativo** (regla 9: un formulario sin
  fila no es un faltante a reclamar). Formularios **sin ningún candidato** con
  `MIN_INSCRIPTOS_SIN_FILA` (10) o más, ventana primero, en dos listas:
  - **posible reemplazo / reunión reubicada** (regla 8): hay otro formulario de la misma figura a
    ±1 día que **ya se escribe** en una fila con la ubicación coincidente. Ej.: Bereciartua
    `Comuna 6 - 29/7` (169), reemplazado por `Comuna 7 - 29/7` en la 714;
  - **sin fila (posible cancelada)**: el resto. Del 30/09 se esperaban Mraida Comuna 3 20/7 (103) y
    22/7 (129), Primera Persona 12/8 (425), Sánchez Zinny San Cristóbal 8/4 (91), Miguel Comuna 15
    22/4 (46).

### y) Revisión con opciones y puntajes — implementada (01/10)

Principio del usuario: **lo que el sistema no resuelve, se lo presenta a una persona con las
opciones y sus puntajes.** En `REVISAR_MATCH` (todos los motivos), después de las columnas de
siempre, y en `EMPAREJAR_MANUAL`, en un bloque nuevo al final (*"POR FILA DEL DESTINO"*), cada fila
del destino muestra hasta `OPCIONES_REVISION` (3) formularios candidatos en el orden del sistema,
con seis columnas por opción: `formulario`, `fila_B`, `inscriptos` (**del formulario**), `score`,
`senales` (`figura ✓ · fecha 1 d · ubicación coincide (comuna) | DESACUERDO (…) | no evaluable ·
eje …`) y `tomado_por` (`libre` / `esta fila` / `fila N`). Al final, una columna vacía
**`elegido`**: el formato de la herramienta manual, **todavía no se lee**. Del destino no se muestra
nada más que lo que ya muestra la fila. Lo que había no cambia: las columnas viejas siguen en su
lugar y `leerConfirmaciones_` no lee el bloque nuevo (columnas A e I vacías).

### z) La traza de las filas no escritas se recalcula en cada corrida (01/10)

Antes, `aplicarDecisiones_` escribía la traza también para los descartados, y como
`setSiDelSistema_` escribe sólo en celda vacía, **quedaba fija** con la decisión de la primera
corrida. Corregido: **una fila que no se escribe no se toca** —ni `RDV_UID`, ni datos, ni traza—.
Su motivo y su mejor candidato viven en `REVISAR_MATCH` / `SIN_MATCH`, que se regeneran en cada
corrida. **Probado en Node** con una hoja simulada: las filas no escritas no reciben ninguna
escritura, y en una segunda corrida con datos cambiados su decisión cambia.

### x) Las derivadas del destino leen `Comunas` B-H — chequeo (30/09)

Las siete columnas `Comuna`, `Poblacion`, `p. Mujer`, `P. Varon`, `(km2)`, `(hab/km2)` y
`Zona` del destino son VLOOKUP del barrio contra `Comunas` B-H (CLAUDE.md 3.1.b). **La
corrección de las columnas E-G de `Comunas` cambió esos valores en el destino, a los correctos.**
`paso14_formulasDestino()` lo confirma: las once derivadas conservan su fórmula (y el ancla no
está en `#REF!`), las siete de lookup leen la columna que corresponde (2 a 8), y fila por fila el
valor del destino es el que da `Comunas` hoy. Sólo lectura: si algo difiere, se lista.

---

## 3. Cómo leer los logs nuevos

Todo el log del upsert salió a **dos columnas**:

```
VENTANA: N en ventana / M totales | corte: dd/MM/yyyy (últimos 6 meses)

  escribiría ..........   312 |   654   (81.5% | 81.5%)
                          ↑       ↑
                       ventana   histórico completo
```

**La columna que decide es la de la izquierda.** La derecha describe, en parte, un origen que ya
no existe — el formulario cambió en 2025-10 y dejó de mandar barrio. Los veredictos automáticos
del log (*"domina la fecha"*, *"el umbral se confirma"*) salen de la ventana.

**El upsert igual procesa las 802 filas**: la ventana filtra lo que se reporta y se calibra, no
lo que se hace. El backfill de la Fase 6 necesita el histórico entero.

Las tres solapas de reporte (`REVISAR_MATCH`, `EMPAREJAR_MANUAL`, `SIN_MATCH`) llevan columna
`en_ventana`, igual que las `DIAG_*`.

---

## 4. Conclusiones viejas que hay que releer, no citar

Estas salieron de la corrida del 25/09 **antes** de que el upsert tuviera la ventana, o sea
sobre las 802 históricas. Están marcadas también en `CLAUDE.md`:

| conclusión | por qué está en cuarentena |
|---|---|
| *"domina la fecha, 52 de 112"* | las 112 incluyen filas de 2025 |
| **81 formularios huérfanos** | ídem, y los midió la puerta de dos términos, ya corregida |
| **56 filas del destino sin candidato** | ídem |

---

## 5. Dónde está cada cosa

### Archivos nuevos de la arquitectura

| archivo | estado |
|---|---|
| [00_Config.js](../00_Config.js) | escrito. **Único lugar con literales** |
| [01_Utils.js](../01_Utils.js) | escrito. Helpers únicos + ventana de análisis |
| [02_Parsing.js](../02_Parsing.js) | escrito. `detect*`, canonización, `coincideEvento_` |
| [05_Escritura.js](../05_Escritura.js) | escrito. `setSiDelSistema_`, `marcarRealizada_`, `correrFase2b()` |
| [20_UpsertDestino.js](../20_UpsertDestino.js) | escrito, **en `DRY_RUN`** |
| `10_LeerOrigenes.js` | **falta** (Fase 4) |
| `30_Derivadas.js` | **falta** (Fase 3) |
| `40_Agenda.js` | **falta** (Fase 8) |
| [40_Alertas.js](../40_Alertas.js) | escrito, **no enganchado**. A mano: `correrAlertaCambios()` |
| [99_Correr.js](../99_Correr.js) | escrito. **El único archivo que se abre para correr algo**: `paso1_…` a `paso3_…`, `paso6_…`, `paso7_…`, `paso10_…` a `paso14_…` y `rehacer_…`; la constante `CASO_A_EXPLICAR`. Sin lógica propia; se actualiza en el mismo commit en que cambia qué correr |
| `99_Pipeline.js` | **falta** (Fase 7) |

### Diagnósticos (sólo lectura, ninguno escribe en el destino)

| archivo | entry points |
|---|---|
| [diagnostico/01_hueco_sexo_edades.js](../diagnostico/01_hueco_sexo_edades.js) | `diagFase1()` y uno por reporte |
| [diagnostico/02_corte_B_a_B2.js](../diagnostico/02_corte_B_a_B2.js) | `diagCorteB()`, `diagDupB2()`, `diagFechaFin()`, `diagScores()`, `diagAnclaFecha()` |
| [diagnostico/03_muestras_mail.js](../diagnostico/03_muestras_mail.js) | `diagMuestrasMail()` |
| [diagnostico/04_legado_fechas.js](../diagnostico/04_legado_fechas.js) | `diagLegToDate()` — qué `legToDate_` gana y qué le llega (`rehacer_verificarLegToDate()`, corrido el 25/09) |
| [diagnostico/05_formularios_faltantes.js](../diagnostico/05_formularios_faltantes.js) | `diagFormulariosFaltantes()` — faltantes y mal fechados (`paso7_…`) |
| [diagnostico/06_revisar_casos.js](../diagnostico/06_revisar_casos.js) | `explicarFormulario()`, `explicarFila()` (`paso12_…`), `listarFormulariosSinFila()` (`paso13_…`, informativo) — decisión w |
| [diagnostico/07_formulas_destino.js](../diagnostico/07_formulas_destino.js) | `diagFormulasDestino()` — las derivadas contra `Comunas` (`paso14_…`) — decisión x |

Todos tienen su `rehacer_…` en [99_Correr.js](../99_Correr.js).
`diagAnclaFecha()` queda como registro de una medición cerrada. **No hace falta volver a
correrlo**: el ancla está descartada (3.3.c).

### Documentos

- [CLAUDE.md](../CLAUDE.md) — la fuente de verdad. Invariante, hallazgos, decisiones, plan
- [docs/sync-bidireccional.md](sync-bidireccional.md) — el paso 5 leído línea por línea
- [docs/agenda-legado.md](agenda-legado.md) — el flujo Agenda, para la Fase 8
- [docs/triggers-legado.md](triggers-legado.md) — inventario de activadores. **Prerrequisito de
  cualquier decisión de archivado**
- [docs/backup.md](backup.md) — las copias de las planillas
- [docs/HANDOFF-2026-09-25.md](HANDOFF-2026-09-25.md) y [docs/HANDOFF-2026-10-01.md](HANDOFF-2026-10-01.md)
  — fotos de cierre de sesión; no se corrigen
- [docs/prompts/](prompts/) — los prompts que originaron cada fase

---

## 6. Las dos cosas que más fácil se rompen si alguien las olvida

**1. El invariante.** El pipeline nunca pisa lo que carga el usuario. Toda escritura al destino
pasa por `setSiDelSistema_`, que escribe **sólo si la celda está vacía**. Verificable de un
vistazo:

```
grep -rn "setValue\|setValues" 20_UpsertDestino.js
```

tiene que dar sólo `escribirHoja_`, que escribe en la **intermedia**, no en el destino.

**2. El color es información.** El `#4F81BD` marca lo que escribió el sistema, y hay 3.779
celdas así. Prohibido contra el destino: `clear()`, `sort()`, `deleteRow()`, `insertRow*()` en el
medio, y cualquier `setBackground` que no sea el azul. La tabla completa está al final de
`CLAUDE.md`.

---

## 7. El orden de lo que sigue

```
Fase 2   base limpia         ── en curso. Cierra sola al final de la Fase 5
Fase 2b  columnas de traza   ── listo el código; falta correr correrFase2b()
Fase 5   upsert              ── escrito, calibrando en DRY_RUN   ← acá estamos
Fase 3   derivadas a valores ── prerrequisito duro de la Fase 9
Fase 4   lectura directa
Fase 6   backfill
Fase 7   activadores
Fase 8   Agenda              ── prerrequisito de la Fase 9
Fase 9   retiro del staging  ── última
```

La Fase 2 **no cierra hasta el final de la Fase 5**, y no es un descuido: tres archivos del
legado no se pueden archivar todavía porque el único activador vivo los necesita. El detalle está
en *"Por qué la Fase 2 no cierra"*, en `CLAUDE.md`.

### aa) Las subzonas de la Comuna 1 — implementadas (01/10, regla 10)

**No son ejes.** Comuna 1 **Norte** = Puerto Madero, Retiro, San Nicolás; **Sur** = Constitución,
Monserrat, San Telmo (`COMUNA1_SUBZONAS`, con `Montserrat` como grafía alternativa). Los títulos
las usan (`Comuna 1 Sur - 3/9`).

- `detectComuna_` sigue devolviendo el número; `detectSubzonaComuna1_` conserva la subzona
  (`Comuna 1 Norte/Sur`, `1N`, `C1S`), que viaja en el candidato como `subzona`. Antes se
  descartaba.
- Ubicación (`comparaComuna_`): formulario con subzona contra una fila de un barrio de la Comuna 1
  → **coincide** si el barrio está en esa subzona, **desacuerdo** si está en la otra (y con la
  regla 8: a revisión, nunca descartar). Sin subzona, o barrio de la Comuna 1 fuera de las listas:
  como antes. La usan también la puerta de `EMPAREJAR_MANUAL`, `cercanosDeFila_`, el paso 7 y
  las herramientas de revisión.
- **Línea fija en el paso 2**: pares que decidió la subzona `[ventana | total]`, con los casos.
- **Probado en Node**: el 3/9 queda igual (Landerreche 768 ← `Comuna 1 Sur - 3/9`, Tapia 769 ←
  `Tapia - Comuna 1 Norte - 3/9`) y `Comuna 1 Sur - 1/10` (125) va a **Monserrat (808)**; Retiro
  (807) queda en desacuerdo.
- **Corrió el 01/10 18:04**: 19 | 32 pares coinciden por la subzona.

### bb) Figuras nombradas sólo por apellido — implementado (01/10)

Los formularios nuevos de Lombardi (*"RDV - Eje norte, Lombardi-Tapia-Piragine- 30/3"*, *"Encuentro
con comerciantes 24/6 Eje Oeste"*, …) nombran a las figuras **sólo por apellido**. El matcher no
las reconocía y esas filas quedaban SIN_MATCH aunque el formulario estuviera a 0 días con los
inscriptos exactos del destino: la búsqueda inversa del 01/10 marcó **510, 542, 620, 658, 686,
755, 798** (y 470, 444 en el histórico). **Son 9 filas de la ventana.**

`FIGURA_POR_APELLIDO = true`: en `figurasEnTexto_`, un apellido suelto cuenta como figura **sólo
si es único** entre las figuras del destino (la última palabra del nombre, que no aparezca en el
nombre de ninguna otra figura; mínimo 4 letras; las entradas que juntan varias figuras no cuentan).
Lombardi → Hernán Lombardi, Tapia → Gabino Tapia, Piragine → Gustavo Arengo Piragine. Uno compartido
no cuenta. Traza `figura_por_apellido`. **Línea nueva del paso 2**: qué formularios suman figuras
así, para ver que no entre basura.

Con tres figuras el formulario es `multi_figura` → REVISAR_MATCH, como los históricos
`HERNÁN LOMBARDI-GUSTAVO ARENGO PIRAGINE`: lo decide una persona con las opciones. **Probado en
Node**: `"RDV - Eje norte, Lombardi-Tapia-Piragine- 30/3"` → 3 figuras → multi_figura; un
apellido compartido ("Miguel", de Mercedes Miguel y Miguel Sabor) no suma. **Predicción**: sin match
en ventana 16 → ≈ 7, revisar 9 → ≈ 18.

**Variantes del legado (01/10, pedido aparte del mismo día).** Se portó la tabla de
`detectPersona_` de `_archivo/Código.js` a `00_Config.js` como **`FIGURAS_VARIANTES`** (una regex
por figura, con su origen), y `figurasEnTexto_` la usa además de la lista del destino: Piñeiro /
Pineiro, Baistrocchi / Biastrocchi, Quirós / Quiroz, "Gustavo Arengo" con o sin "Piragine",
Landerreche / Landereche, y los dos casos del 2b: **"Horacio Lombardi" → Hernán Lombardi** y
**"Arengo Peragine" → Gustavo Arengo Piragine**. Traza `figura_por_variante` (o
`figura_por_apellido`). También se portaron las variantes de barrio (**`BARRIOS_VARIANTES`**:
Vélez, Paternal, Pompeya, Lugano…), que entran sólo si `Comunas` no reconoció ningún barrio. La
línea del paso 2 cuenta y lista las dos cosas. **Bug arreglado de paso**: `_expandirAbreviaturas_`
dejaba el punto de `gral.`, y "Villa Gral. Mitre" no coincidía nunca con "Villa Gral Mitre". Probado
en Node (Pineiro, Landereche, Horacio Lombardi, Arengo Peragine, Quiroz, Biastrocchi, Pompeya,
Velez, Paternal, Lugano, Villa Gral Mitre). La predicción no cambia: **sin match 16 → ≈ 7, revisar
≈ +9**; la línea de variantes puede sumar algún formulario más, y eso es lo que hay que mirar.

**Paso 13** (01/10): "Primera Persona 12/8 con Nicolás Vázquez" (425) salió como reemplazado por
`1 a 1 - 12/8 Parque Avellaneda` (128), y puede ser otra reunión del mismo día. Queda en la lista,
marcado **DUDOSO** cuando el formulario "viejo" tiene más inscriptos que el "nuevo"; el encabezado
aclara que la lista es para que el equipo confirme.

---

## 7b. Ideas para después

- **La Agenda (Fase 8) tiene el lugar final de cada reunión.** Sirve para **confirmar
  reubicaciones** (regla 8: si la Agenda dice el barrio de RDV, el formulario con otra comuna es el
  viejo) y para **detectar filas que faltan en RDV** (una reunión agendada y realizada sin fila).
  El destino ya trae un texto de agenda por fila. Sin medir: es una fuente a cruzar cuando toque la
  Fase 8, no una regla.
- ~~**Escribir solas las reubicaciones sin ambigüedad**~~: **descartado el 01/10** (sin ambigüedad
  2 | 4): quedan en revisión (decisión v).
- **No evaluar una fila sin barrio con menos de 1 día** (regla de las 17): medida en el paso 2, sin
  implementar (1a).
- ~~**Tolerancia asimétrica para los formularios con fuente `fecha_fin`**~~: **implementada el
  01/10** (decisión s).

**Handoff del 01/10:** [docs/HANDOFF-2026-10-01.md](HANDOFF-2026-10-01.md), el texto del usuario
(01/10 noche), guardado tal cual. Es una foto: su "Pendiente para Code" (puntos 1 a 4) ya está
hecho en `5f84cc1`; lo que sigue es correr el paso 2 y el paso 10.

---

## 8. La regla de trabajo que conviene no perder

> **Si el próximo commit de código invalida algo que dice `CLAUDE.md`, el documento se corrige en
> ese mismo commit.** No en el siguiente, no en uno de limpieza al final.

En esta migración cambiamos de premisa doce veces. Entre la medición y la actualización, el
documento decía algo falso — y ése es justo el momento en que alguien lo abre para decidir.
