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
| 1 | `paso1_columnasDeTraza()` | `correrFase2b()` | agrega los encabezados de las 5 columnas de traza al final del destino | sí, sólo encabezados |
| 2 | `paso2_upsertEnSeco()` | `correrEnSeco()` | el upsert completo en `DRY_RUN` | **no toca el destino**; escribe 3 solapas de reporte en la intermedia |
| 3 | `paso3_medirReglaDelMes()` | `diagCorteB()` | mide la regla del mes contra las `fecha_mal_parseada` | no toca el destino; escribe `DIAG_CORTE_B` |

Si en el paso 2 falla la escritura de un reporte: `paso2_rehacer_revisarMatch()`,
`paso2_rehacer_emparejarManual()` o `paso2_rehacer_sinMatch()`, que rehacen sólo ése.

**`DRY_RUN = true` en [20_UpsertDestino.js](../20_UpsertDestino.js).** No se cambia hasta haber
leído los números de la corrida en seco.

> El pipeline legado está **frenado a propósito**: un solo activador vivo,
> `syncAgendaSheetInBaseFromAgenda_2`. Ver el recuadro de la sección 2 de `CLAUDE.md`. No
> encender nada sin leerlo.

---

## 2. Qué hay que mirar de esa corrida, y qué decide cada número

Son cuatro decisiones pendientes, todas esperando el mismo log. **Ninguna se toma sin el número
delante**; están descritas en `CLAUDE.md` con su razonamiento completo.

### a) ¿El umbral 0,88 sigue valiendo?

Bloque **`barrido de umbral`** del log. El 0,88 salió del valle de la distribución **histórica**,
que mezcla el formulario viejo con el de ahora. `_logValle_()` recalcula la meseta **sobre la
ventana de 6 meses** y dice una de tres cosas:

- cae adentro → no tocar nada;
- cae afuera → el log propone el medio de la meseta medida. Cambiar `UMBRAL_MATCH` en
  [00_Config.js](../00_Config.js) **y anotar el número al lado**;
- el barrido no calibra → la población está toda de un lado. No inventar un corte.

### b) ¿Se enciende `EVENTO_COMO_UBICACION`?

Bloque **2d**. Hoy está en `false`. Se enciende si el evento cubre una parte apreciable de las
filas temáticas y coincide donde tiene que coincidir.

> **Ojo con la aritmética, está en el log y conviene creerle:** el evento sube el numerador y el
> denominador, así que `figura + fecha ±7 + evento` da **0,73** — sigue debajo del umbral.
> Encenderlo **no rescata por sí solo** a una fila con la fecha rota. Donde cambia algo es en el
> margen entre candidatos.

### c) ¿La regla del mes resolvió las `fecha_mal_parseada`?

Bloque **`LA REGLA DEL MES`** de `diagCorteB()`. Lo esperable es *casi todas*. Si da cero, la
regla no es la explicación y hay que mirar los casos que el log lista uno por uno — puede que el
día del texto también esté mal.

### d) ¿Cuántos huérfanos quedan con la puerta de tres vías?

Bloque **3**. La puerta de `EMPAREJAR_MANUAL` pasó de `figura Y fecha±21` a
`figura Y (fecha±21 O comuna O evento)`. Con la versión de dos términos los formularios
huérfanos habían saltado de 11 a 81 y las filas sin candidato de 0 a 56. **Deberían bajar.** Si
no bajan, el problema no era la puerta.

> Y la **densidad** (pares por fila) tiene que quedar entre 2 y 4. Si pasa de 5 el log avisa: la
> lista no se puede trabajar y la puerta quedó laxa de nuevo.

### e) ¿La `Zona` de `Comunas` es el eje? ¿Se enciende `EJE_COMO_UBICACION`?

Bloque **2e**, punto a). Vuelca cada valor de la columna 8 de `Comunas` con sus barrios. Si
nombran `Norte/Sur/Centro/Oeste` **y los barrios se ven bien**, el mapeo está; si no, hay que
escribirlo, y el punto b) —cada formulario con eje contra los barrios del destino con los que
se emparejaría, más el cruce eje × zona— es el material para armarlo. Hoy en `false`.

> Mirar ahí también las `Comuna 1 Norte` / `Comuna 1N`: se detectan pero **no se usan como
> eje** hasta saber si son el eje o la mitad norte de la comuna.

### f) ¿Los formularios temáticos tienen alguna reunión cerca?

Bloque **2e**, punto c). Para cada formulario temático, si hay **alguna** fila de su figura a
±3 días. Los que no tienen ninguna se listan uno por uno: **son huérfanos reales**, y ningún
peso de ubicación los salva. El caso a mirar primero es **B fila 730** (Eje Sur, 14/08), cuyos
cuatro candidatos están a 7, 7, 11 y 13 días.

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
| [99_Correr.js](../99_Correr.js) | escrito. **El único archivo que se abre para correr algo**: `paso1_…` a `paso3_…` y `rehacer_…`. Sin lógica propia; se actualiza en el mismo commit en que cambia qué correr |
| `99_Pipeline.js` | **falta** (Fase 7) |

### Diagnósticos (sólo lectura, ninguno escribe en el destino)

| archivo | entry points |
|---|---|
| [diagnostico/01_hueco_sexo_edades.js](../diagnostico/01_hueco_sexo_edades.js) | `diagFase1()` y uno por reporte |
| [diagnostico/02_corte_B_a_B2.js](../diagnostico/02_corte_B_a_B2.js) | `diagCorteB()`, `diagDupB2()`, `diagFechaFin()`, `diagScores()`, `diagAnclaFecha()` |
| [diagnostico/03_muestras_mail.js](../diagnostico/03_muestras_mail.js) | `diagMuestrasMail()` |

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

En esta migración cambiamos de premisa siete veces. Entre la medición y la actualización, el
documento decía algo falso — y ése es justo el momento en que alguien lo abre para decidir.
