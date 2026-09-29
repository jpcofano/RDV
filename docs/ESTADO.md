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
| 2 | `paso2_upsertEnSeco()` | `correrEnSeco()` | el upsert completo en `DRY_RUN` | **no toca el destino**; escribe 3 solapas de reporte en la intermedia. Corrió el 26/09 11:36; **se vuelve a correr después del 6** |
| 3 | `paso3_medirReglaDelMes()` | `diagCorteB()` | mide las `desfase_reprogramacion` (antes `fecha_mal_parseada`): texto = `fecha_fin` y destino corrido 1-3 días | no toca el destino; escribe `DIAG_CORTE_B` |
| 6 | `paso6_medirFormulariosSinFigura()` | `medirFormulariosSinFigura()` | el tamaño de sacar la figura del denominador para los formularios que no nombran a nadie (decisión k) | **no escribe en ninguna planilla**; sólo log. **← PRÓXIMO** |

**Línea base para la próxima comparación: la corrida en seco del 26/09 11:36**, la primera con
la figura buscada sobre el texto completo. Corte de ventana **fijo** en 26/03/2026
(`VENTANA_ANALISIS_DESDE`, `00_Config.js`), base 302 filas:

```
                  25/09 18:13   26/09 11:36
escribiría (total)       627          641
a revisar  (total)        68           85
sin match  (total)       107           76
2f figura_no_reconocida (ventana)   103 (37,3%)   92 (32,7%)
densidad EMPAREJAR_MANUAL           4,9           7,0
"ninguno a ±3" del 2b (ventana)      15            23
```

> ⚠️ **El 2f no cuenta filas que fallan.** Cuenta filas cuyo formulario de comuna más cercano no
> fue el que ganó; muchas se escriben igual con otro formulario (los 25 ejemplos del 26/09 eran
> casi todos `fila: escribiria`). El 37,3% y el 32,7% **no** son "filas que fallan". El log
> nuevo cruza cada motivo con el veredicto de la fila (decisión l).

Las ventanas del log ya no son comparables con las de antes del 26/09 si no se corrigen por el
corte: la del 25/09 usaba 25/03 (base 307).

Ya corridos, en el bloque YA CORRIDOS de `99_Correr.js`: `rehacer_medirFiguraEnPrefijo()` (el
viejo paso 4, decisión i) y `rehacer_verificarLegToDate()` (el viejo paso 5, decisión j).

Si en el paso 2 falla la escritura de un reporte: `paso2_rehacer_revisarMatch()`,
`paso2_rehacer_emparejarManual()` o `paso2_rehacer_sinMatch()`, que rehacen sólo ése.

**`DRY_RUN = true` en [20_UpsertDestino.js](../20_UpsertDestino.js).** No se cambia hasta haber
leído los números de la corrida en seco.

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
toma el formulario de la misma comuna más cercano en fecha y dice por qué no entró. Si domina
`figura_no_reconocida_en_el_formulario`, el arreglo es cómo `figurasEnTexto_` reconoce nombres,
y es la misma causa probable que la del punto d).

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

### m) ¿De dónde sale la densidad de `EMPAREJAR_MANUAL`? (4,9 → 7,0)

Bloque **3** del paso 2: pares por figura de la fila (top 10) y cuántos existen **sólo porque la
figura sale del prefijo**. Hipótesis a confirmar o descartar: la subida son las filas de Jorge
Macri por los formularios `JORGE MACRI - ...` que ahora reconocen la figura. Si esos pares no
son la mayor parte de la subida, la hipótesis cae.

### n) ¿Por qué "ninguno a ±3" pasó de 15 a 23?

Bloque **2b** del paso 2. "ninguno" se cuenta igual que antes (para poder comparar) y se
desglosa en *con un formulario a ±3 de OTRA figura* y *sin ningún formulario*, con la lista de
las filas (fecha, figura, barrio). Hipótesis, sin medir: los `JORGE MACRI - ...` que antes eran
"sin figura" ahora son "de otra figura" para filas de otras personas. Parte puede ser población:
entre las dos corridas el corte se movió; desde ahora está fijo (`VENTANA_ANALISIS_DESDE`).

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
| [99_Correr.js](../99_Correr.js) | escrito. **El único archivo que se abre para correr algo**: `paso1_…` a `paso3_…`, `paso6_…` y `rehacer_…`. Sin lógica propia; se actualiza en el mismo commit en que cambia qué correr |
| `99_Pipeline.js` | **falta** (Fase 7) |

### Diagnósticos (sólo lectura, ninguno escribe en el destino)

| archivo | entry points |
|---|---|
| [diagnostico/01_hueco_sexo_edades.js](../diagnostico/01_hueco_sexo_edades.js) | `diagFase1()` y uno por reporte |
| [diagnostico/02_corte_B_a_B2.js](../diagnostico/02_corte_B_a_B2.js) | `diagCorteB()`, `diagDupB2()`, `diagFechaFin()`, `diagScores()`, `diagAnclaFecha()` |
| [diagnostico/03_muestras_mail.js](../diagnostico/03_muestras_mail.js) | `diagMuestrasMail()` |
| [diagnostico/04_legado_fechas.js](../diagnostico/04_legado_fechas.js) | `diagLegToDate()` — qué `legToDate_` gana y qué le llega (`rehacer_verificarLegToDate()`, corrido el 25/09) |

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

En esta migración cambiamos de premisa once veces. Entre la medición y la actualización, el
documento decía algo falso — y ése es justo el momento en que alguien lo abre para decidir.
