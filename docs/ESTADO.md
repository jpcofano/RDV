# Estado de la migración — al 2026-09-25

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
| 2 | `paso2_upsertEnSeco()` | `correrEnSeco()` | el upsert completo en `DRY_RUN` | **no toca el destino**; escribe 3 solapas de reporte en la intermedia. Última: 26/09 16:45. **← PRÓXIMO**: primera corrida con `SIN_FIGURA_POR_UBICACION` y el tope de `EMPAREJAR_MANUAL` |
| 3 | `paso3_medirReglaDelMes()` | `diagCorteB()` | mide las `desfase_reprogramacion` (antes `fecha_mal_parseada`): texto = `fecha_fin` y destino corrido 1-3 días | no toca el destino; escribe `DIAG_CORTE_B` |
| 6 | `paso6_medirFormulariosSinFigura()` | `medirFormulariosSinFigura()` | el tamaño de sacar la figura del denominador para los formularios que no nombran a nadie (decisión k) | **no escribe en ninguna planilla**; sólo log. Corrió el 26/09 |
| 7 | `paso7_formulariosFaltantes()` | `diagFormulariosFaltantes()` | las filas sin formulario propio: ¿mal fechadas, perdidas en el IMPORTRANGE o faltantes en la consulta de `Hoja1`? (decisión o) | **no escribe en ninguna planilla**; sólo log. Corrió el 26/09 16:42 |
| 9 | `paso9_medirDesempatePorEvidencia()` | `medirDesempatePorEvidencia()` | desempatar las `margen_chico` por señales, distancia y **más inscriptos del formulario** (decisión q) | **no escribe en ninguna planilla**; sólo log. Corrió el 26/09 17:06 (37 de 38); **se vuelve a correr** con el criterio 3 nuevo |
| 10 | `paso10_validarContraInscriptos()` | `medirValidacionInscriptos()` | calibración de una vez contra los inscriptos que hoy tiene el destino (decisión s) | **no escribe en ninguna planilla**; sólo log. **No entra en el score** |

El paso 8 ya corrió (26/09 16:46) y está en YA CORRIDOS como `rehacer_medirVariantesSinFigura()`;
su variante D-C quedó implementada (decisión p).

**Línea base vigente: la corrida en seco del 26/09 16:45**, con `B` actualizada (807
formularios). Corte de ventana **fijo** en 26/03/2026 (`VENTANA_ANALISIS_DESDE`, `00_Config.js`);
**304 evaluables**. Y la **predicción** para el próximo paso 2, anotada **antes** de correrlo:

```
(ventana)       26/09 16:45        predicción próximo paso 2
escribiría          229                  ≈ 241
a revisar            38                  ≈  39
sin match            37                  ≈  25
                     = score_bajo 23 + sin_formulario_propio 14
```

Después del paso 2, correr el 9 y el 10 (en ese orden). Si el paso 2 se aleja mucho de la
predicción, mirar antes de seguir: la predicción sale de la
medición de D-C (12 de 14 objetivos recuperados, 1 a revisión, costo 0).

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

> 🔴 **BLOQUEANTE para `DRY_RUN = false`: el invariante "un formulario, una fila" está roto.**
> Nada impide hoy que un formulario gane dos filas con veredicto `escribiria`, y sus inscriptos se
> escribirían en las dos (CLAUDE.md 3.1.j; tres casos en el paso 9). El bloque 0 del log del paso 2
> lo chequea siempre y simula la regla que lo arreglaría. **Mientras diga ROTO, no se escribe.**
> Ver decisión r).

> El pipeline legado está **frenado a propósito**: un solo activador vivo,
> `syncAgendaSheetInBaseFromAgenda_2`. Ver el recuadro de la sección 2 de `CLAUDE.md`. No
> encender nada sin leerlo.

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

### g) ¿La `Zona` de `Comunas` es el eje? ¿Se enciende `EJE_COMO_UBICACION`?

Bloque **2e**, punto a). Vuelca cada valor de la columna 8 de `Comunas` con sus barrios. Si
nombran `Norte/Sur/Centro/Oeste` **y los barrios se ven bien**, el mapeo está; si no, hay que
escribirlo, y el punto b) —cada formulario con eje contra los barrios del destino con los que
se emparejaría, más el cruce eje × zona— es el material para armarlo. Hoy en `false`.

> `Comuna 1 Norte` / `Comuna 1N` **no son eje** (subdivisiones de la Comuna 1): las lee
> `detectComuna_` como comuna 1.

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

### q) ¿El desempate por evidencia elige bien? (confirmar a mano)

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

Sigue siendo medición: **no se implementa hasta ver el paso 10**. El orden por evidencia vive en
una sola función, `_desempatePorEvidencia_`, que usan también la regla simulada de r) y el paso 10.

### r) 🔴 El invariante "un formulario, una fila" (BLOQUEANTE para escribir)

Bloque **0** del log del paso 2, fijo. Cuenta cuántos formularios ganan 2+ filas con veredicto
`escribiria` [ventana | total], con los casos, y **simula sin implementarla** la regla: un
formulario va a una sola fila; si varias lo reclaman, se lo queda la de mejor evidencia
(`_desempatePorEvidencia_`: señales, distancia); las otras se re-evalúan sin ese formulario, y si
no les queda nada claro van a REVISAR_MATCH con motivo `formulario_compartido`. Los inscriptos del
destino no entran.

Los tres casos del paso 9: `1 a 1 - Comuna 5 17/6` (filas 645 y 648), `RDV JM Velez Sarfield - 5/6`
(626 y 631), `Clara Muzzio 07/11 Villa Pueyrredon` (309 y 315). **Mientras el bloque 0 diga
ROTO, `DRY_RUN` no pasa a `false`.**

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
| [99_Correr.js](../99_Correr.js) | escrito. **El único archivo que se abre para correr algo**: `paso1_…` a `paso3_…`, `paso6_…`, `paso7_…`, `paso9_…`, `paso10_…` y `rehacer_…`. Sin lógica propia; se actualiza en el mismo commit en que cambia qué correr |
| `99_Pipeline.js` | **falta** (Fase 7) |

### Diagnósticos (sólo lectura, ninguno escribe en el destino)

| archivo | entry points |
|---|---|
| [diagnostico/01_hueco_sexo_edades.js](../diagnostico/01_hueco_sexo_edades.js) | `diagFase1()` y uno por reporte |
| [diagnostico/02_corte_B_a_B2.js](../diagnostico/02_corte_B_a_B2.js) | `diagCorteB()`, `diagDupB2()`, `diagFechaFin()`, `diagScores()`, `diagAnclaFecha()` |
| [diagnostico/03_muestras_mail.js](../diagnostico/03_muestras_mail.js) | `diagMuestrasMail()` |
| [diagnostico/04_legado_fechas.js](../diagnostico/04_legado_fechas.js) | `diagLegToDate()` — qué `legToDate_` gana y qué le llega (`rehacer_verificarLegToDate()`, corrido el 25/09) |
| [diagnostico/05_formularios_faltantes.js](../diagnostico/05_formularios_faltantes.js) | `diagFormulariosFaltantes()` — faltantes y mal fechados (`paso7_…`) |

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

---

## 8. La regla de trabajo que conviene no perder

> **Si el próximo commit de código invalida algo que dice `CLAUDE.md`, el documento se corrige en
> ese mismo commit.** No en el siguiente, no en uno de limpieza al final.

En esta migración cambiamos de premisa doce veces. Entre la medición y la actualización, el
documento decía algo falso — y ése es justo el momento en que alguien lo abre para decidir.
