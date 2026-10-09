# El script atado a la base (tablero de Looker Studio) — FASE 1: informe de integridad (08/10)

Decisión del usuario (07/10): el script atado al archivo de la base pasa a nuestro sistema. Esta es la **FASE 1**: leer,
contar lo que hace y lo que está mal, y proponer. **No se cambió nada** del script ni de la base. La FASE 2 (la migración)
empieza cuando el usuario apruebe este informe.

- Proyecto: el script **atado** al archivo de la base (otro proyecto de Apps Script; el dueño del archivo es otra
  cuenta, y sus activadores no se ven por API). Copia de lectura en `_externo/base-script/` (fuera del repo: `.gitignore`).
- Vivas: **`unpivotEventos()`** (`Unpivot2.js`) y **`buildAuxMaximos()`** (`Auxiliar.js`). Lo demás (`Código.js`,
  `Graficos.js`, `Sin título.js`, `Sin título 2.js`, `Unpivot.js`) está entero dentro de comentarios: versiones viejas.
- Cuándo corren: no se ve desde acá. La última corrida de `unpivotEventos` queda en la columna `FechaCarga` de
  Datos_Unpivot: el **paso 53** la muestra (correrlo dos o tres veces en el día da el horario).

## 1. `unpivotEventos()` → solapa **Datos_Unpivot**

Lee `RVD JM-CM - ES` entera y, por cada fila con Figura (o con ID), escribe una fila por categoría con valor:

| CategoriaGrupo | Categoria | de qué columna de RVD |
|---|---|---|
| Canal | Mail, Call Center, RRSS, Difusión, IVR | las del mismo nombre |
| Género | Masculinos, Femeninos, Sin identificar | las del mismo nombre (ver 2 y 3) |
| Rango Etario | 18-24, 25-39, 40-55, 56-65, 66+, Sin identificar | las del mismo nombre |

**12 columnas, en este orden:** `ID`, `Figura`, `Barrio`, `EVENTO`, `Día de la semana`, `FECHA`, `HORA`,
`STATUS REUNIÓN`, `CategoriaGrupo`, `Categoria`, `Valor`, `FechaCarga`. Borra el contenido y la reescribe entera en
cada corrida: no guarda historia (`FechaCarga` es la hora de la corrida, igual en todas las filas).

Lo que está mal o es frágil:

1. **Escribe la columna ID de RVD**, fila por fila, sólo donde está vacía: `[Figura, Barrio, EVENTO, Día de la semana,
   FECHA, HORA]` unidos por `" | "` **con los valores crudos**. La FECHA (y la HORA, cuando es una hora de Sheets y no
   texto) sale como la escribe JavaScript: `Tue Oct 06 2026 00:00:00 GMT-0300 (…)`. **Es el formato roto.** Y queda congelado: si después se
   carga el barrio o se mueve la fecha, ese ID no cambia más. Si RVD no tuviera columna "ID", la crearía al final.
2. **"Sin identificar" de género repite el de edad.** RVD tiene una sola columna "Sin identificar" —el resto de las
   EDADES: Inscriptos − las cinco franjas (CLAUDE.md 1.e.2)— y el script la usa para los dos grupos. Como el sexo está
   escalado a Inscriptos y las edades no, en género sobra: con Inscriptos 100, Masculinos 56, Femeninos 44 y 80
   identificados por edad, el género muestra 56 + 44 + **20** = 120.
3. **Alias peligrosos**: si no encuentra "Masculinos" / "Femeninos", usa "P. Varon" / "P. Mujer", que son la
   **población de la comuna** (derivadas de `Comunas`: decenas de miles). Hoy no pasa (las columnas existen), pero un
   renombre lo dispararía sin aviso.
4. Una categoría en 0 no tiene fila (los ceros no se escriben); un negativo, sí.
5. Una fila sin Figura pero con ID entra con la figura vacía; sin figura y sin ID, no entra.
6. Borra antes de escribir: si falla en el medio, Datos_Unpivot queda vacía hasta la próxima corrida.

## 2. `buildAuxMaximos()` → solapa **Aux_Maximos**

Sólo lee RVD. Por tres "niveles" —Barrio, Día de la semana, HORA— y por fecha, sólo reuniones realizadas:

- **MaxPorFechaStatus**: la reunión con más asistentes por (nivel, clave, fecha, status);
- **MaxPorFiguraFecha**: ídem por (nivel, clave, fecha, figura);
- **TotalPorFiguraFecha**: asistentes, inscriptos y cantidad de reuniones por (nivel, clave, fecha, figura, status).

**18 columnas, en este orden:** `Figura`, `Barrio`, `EVENTO`, `Día de la semana`, `FECHA`, `HORA`, `STATUS REUNIÓN`,
`Inscriptos`, `Asistentes`, `ID`, `Granularidad`, `Nivel`, `Clave`, `Max_Asistentes`, `Tot_Asistentes`,
`Tot_Inscriptos`, `Cant_Reuniones`, `Realizada_Flag`.

Lo que está mal o es frágil:

1. **Exige 24 encabezados exactos de RVD aunque usa 11** (no usa Dirección, One Page Entregado, Observaciones, los cinco
   canales, los oradores, Temas mas comentados, % de Asistencia, Direccion2 ni Falta Informacion). Si se renombra
   cualquiera, falla entera y **Aux_Maximos queda vieja sin aviso** (el error le llega por mail al dueño).
2. **Saltea las filas sin ID**: depende de que `unpivotEventos` haya corrido antes para las filas nuevas.
3. **"Realizada" = el status lo dice, o tiene asistentes ≥ 1.** Una "Suspendida" o "Reprogramada" con asistentes cargados
   cuenta como realizada. (No es una de las correcciones pedidas; se avisa y queda igual salvo que se decida otra cosa.)
4. Las columnas de salida **Inscriptos, Asistentes e ID están siempre vacías** (el código nunca las llena);
   `Realizada_Flag` es siempre "1".
5. El barrio va tal como está escrito: dos grafías del mismo barrio son dos claves.

## 3. Riesgos con lo nuestro, hoy

- **La regla 7 de la agenda** (borrar una fila que creó la agenda, que nadie tocó y que desapareció del mail): el ID que
  escribe `unpivotEventos` la vuelve "tocada" (`filaIntocadaAgenda_`: "tiene ID cargado"), así que ya no se puede borrar
  y queda Suspendida. En la FASE 2 se arregla solo: el ID pasa a ser derivada, y las derivadas no cuentan.
- Escribe en el destino por fuera de nuestro escritor (sin color, celda por celda) y en cualquier momento: si justo la
  agenda borrara una fila en el medio, el ID iría a la fila de abajo (poco probable: hacen falta las dos corridas a la vez).
- Si cambia un encabezado que usa el script, el tablero deja de actualizarse y nadie de nuestro lado se entera.

## 4. La ID

**Los formatos** (paso 50, 07/10, y el usuario):

| formato | quién lo arma |
|---|---|
| `Figura - Barrio - dd/MM/yyyy` (el bueno; sin barrio, `Figura - dd/MM/yyyy`) | el legado: `buildIdFinal_` (`Agenda push a base.js`) y `buildIdA2_` (`Sinc A to A2.js`); llegaba a RVD por Para Revisar y el paso 5 (`syncBaseFinal_ParaRevisar_y_RVD`, que escribe en celdas vacías y pinta `#4F81BD`). O una fórmula en la celda (el usuario recuerda una en el backup) |
| con `" \| "` y `GMT` | `unpivotEventos` (1.1) |
| con guiones bajos | **ningún código que tenemos**: ni el nuestro, ni el legado, ni lo archivado, ni el script atado, ni "CODIGOS Ajuste RDV" (ése arma `persona\|yyyyMMdd` y escribe en Para Revisar). Una persona u otro script |

> **Resuelto con el paso 53 (08/10 17:12): ningún ID cambió desde el 04/10.** Los "7 que cambiaron" eran de la medición
> del paso 50, que comparaba cada fila con la primera del backup de la misma figura y fecha (corregido). Nada más escribe
> la ID. Hay **26 ID repetidos** (`Jorge Macri | | | | |` en 78 filas): Datos_Unpivot cuenta **627 ID distintos para
> ~827 reuniones**. El formato propuesto da **0 repetidos**. Lo que sigue es cómo se planteó antes de medir.

**Qué más la escribe (los 7 que cambiaron desde el 04/10).** Nada de este proyecto escribe la columna ID, salvo el paso 5
del legado (`Sinc Base usuario.js`), que sigue en el proyecto pero sin activador en nuestra cuenta desde el 24/09; un
activador de **otra cuenta** no se ve desde acá. Quedan tres posibilidades, y el **paso 53** las separa celda por celda:

- **con fórmula hoy** → la calcula la planilla: cambia sola cuando se carga el barrio o se mueve la fecha;
- **fondo `#4F81BD` y el mismo ID en Para Revisar** → el paso 5 del legado, corriendo con otra cuenta (completa TODAS las
  columnas vacías salvo las derivadas, ID incluida, y pinta el azul viejo: si corrió, las celdas `#4F81BD` de toda la base
  aumentan desde el 04/10; el sistema pinta `#CFE2F3` desde el 02/10. El paso 53 las cuenta);
- **sin fórmula ni color** → una persona (o un script de otra cuenta): clic derecho en la celda → "Mostrar historial de
  ediciones" dice la cuenta y la hora.

**Propuesta de formato único: el bueno de antes, `Figura - Barrio - dd/MM/yyyy`** (el que reconoce el equipo y el de la
decisión 7 de CLAUDE.md); sin barrio, `Figura - dd/MM/yyyy`, como hacía el legado; vacía sin Figura. Como derivada 12,
recalculada en cada corrida: nunca queda vieja. Si dos filas dan el mismo ID (misma figura, barrio y día), a esas dos se
les agrega `- HH:mm`. El paso 53 (sección 6) dice cuántas repetiría hoy y si la hora alcanza para separarlas.
No el de `" | "` con EVENTO, día y hora: es más largo y cambia cada vez que se toca el evento o la hora; la hora sólo hace
falta para desempatar.

**¿Looker usa la ID como clave?** Desde acá no se ve: la configuración del tablero no está en la planilla ni se puede
leer por API. Lo que dicen los datos:

- en Aux_Maximos la ID está **siempre vacía**: nada puede unir Aux_Maximos con otra fuente por ID;
- en Datos_Unpivot la ID es lo único que identifica la reunión (se repite una vez por categoría): lo más probable es que
  se use para **contar reuniones** ("Recuento distinto" de ID) o como dimensión de una tabla. Para eso el formato da
  igual; importa que sea **única por reunión** —dos reuniones con la misma ID se cuentan como una: el paso 53 (sección 4)
  dice cuántas repetidas hay hoy— y que Datos_Unpivot use la misma ID que la base (en la FASE 2, en la misma corrida).

Lo que sí rompería un cambio de formato: un **campo calculado** que parta la ID (por ejemplo, para sacar la fecha), un
**filtro** guardado con IDs puntuales o una **combinación** (blend) con otra fuente por ID. Cómo mirarlo en Looker Studio
(2 minutos): *Recurso → Administrar las fuentes de datos agregadas → Datos_Unpivot → Editar* (¿algún campo calculado usa
ID?); *Recurso → Administrar combinaciones* (¿alguna une por ID?); y en los gráficos, ¿alguna métrica es "Recuento
distinto" de ID?

## 5. Qué cambia y qué queda igual (FASE 2, después de aprobar)

**Queda igual:** los nombres de las solapas, los encabezados y el **orden de las columnas** (12 y 18); qué filas entran y
cuáles no, las categorías, los ceros que no se escriben, el criterio de "realizada", los tres niveles y las tres
granularidades, Inscriptos / Asistentes / ID vacías en Aux_Maximos, `Realizada_Flag` "1", los formatos de Aux_Maximos.

**Cambia:**

- **quién las arma**: nuestro proyecto, dentro de la corrida de la hora (`upsertDiario`), después de las derivadas, con
  tests en Node. El script atado queda con las dos funciones vacías, que sólo anotan "migrado al sistema RDV el
  <fecha>" (el único `clasp push` a ese proyecto, desde una carpeta fuera del repo con su propio `.clasp.json`);
- **la ID**: derivada 12, calculada en cada corrida en todas las filas; nadie más la escribe. Datos_Unpivot la toma de
  ahí. Si hoy la columna tiene fórmula (el paso 53 lo dice), se saca con respaldo, como las otras once (una columna con
  fórmula no se escribe);
- los encabezados se buscan normalizados; si falta uno, aviso en el log y **esa solapa no se reescribe** (queda la de
  antes);
- la escritura, en bloque;
- **antes de escribir, en seco**: lo que armaría el sistema contra las solapas de hoy, celda por celda; las únicas
  diferencias esperadas son la ID y el "Sin identificar" de género.

**Correcciones de datos, a aprobar:**

1. **"Sin identificar" de género = Inscriptos − Masculinos − Femeninos** (vacía si falta alguno de los tres). Si da
   negativo —filas viejas con el total cargado a mano y el desagregado calculado contra otro total, las de
   `DIAG_TOTAL_DIVERGENTE`—, ¿0 o sin fila? Propuesta: sin fila (como un 0 hoy).
2. **Sin el reemplazo por "P. Varon" / "P. Mujer".**

## 6. Para correr (sólo lectura)

- **`paso53_investigarId()`**: los formatos (backup del 04/10 y hoy), qué escribió cada ID que cambió, los de guiones
  bajos, los ID repetidos, la última corrida del script atado y cuántos repetiría el formato propuesto.

## 7. FASE 2 (08/10): hecha

Aprobado por el usuario el 08/10: la ID `Figura - Barrio - dd/MM/yyyy` (sin barrio `Figura - dd/MM/yyyy`; vacía sin
figura; `- HH:mm` si se repite), derivada 12, recalculada en cada corrida; "Sin identificar" de género = Inscriptos − M −
F (si no da positivo, sin fila); sin el reemplazo por P. Varon / P. Mujer. **Queda igual:** una Suspendida con asistentes
cuenta como realizada; las columnas vacías de Aux_Maximos.

- **`44_Looker.js`**: `idsDerivados_` (la ID), `armarDatosUnpivot_` y `armarAuxMaximos_` (modo `compatible` = el script
  atado tal cual; modo `corregido` = con las tres correcciones), `escribirSolapasLooker_` (la corrida de la hora, después de
  las derivadas, con `LOOKER_EN_SISTEMA`). La ID la escribe `recalcDerivadas_` como las otras derivadas.
- **La fidelidad, probada contra el original**: `tests/looker.test.js` corre `unpivotEventos` y `buildAuxMaximos` de la
  copia de `_externo/` (sin subirla al repo) y el modo compatible da lo mismo, celda por celda.
- **Las pruebas sobre los datos reales** (paso 54, 08/10 19:00): **A** — Aux_Maximos idéntico, Datos_Unpivot sólo la
  fila 6 (corregida en la base después de la última corrida del script atado); **B** — sólo 816, 819, 820 y 821 (escritas
  después) y 4 filas sin ID; **C** — OTRA 0, reuniones distintas 627 → 795, ID repetidas 0. **Aprobado.**
- **Prendido el 08/10** (`LOOKER_EN_SISTEMA = true`). **El script atado, vacío el mismo día** (21:22): subido con
  `clasp push -f` desde `script-atado-base/` (al lado del repo, con su propio `.clasp.json`; la copia del original sigue en
  `_externo/base-script/`), cuando el usuario le dio permiso de edición a la cuenta de clasp (antes: `CAN_EDIT: false`).
  Verificado con un clon posterior: el remoto es exactamente esa carpeta. Quedó así:
  - **`Migrado.js`**: las dos funciones activas, vacías —no leen ni escriben ninguna planilla—, por si el activador todavía
    las llama:

```js
function unpivotEventos() {
  Logger.log('unpivotEventos: migrado al sistema RDV el 08/10/2026. No hace nada: Datos_Unpivot la arma el sistema RDV cada hora.');
}
function buildAuxMaximos() {
  Logger.log('buildAuxMaximos: migrado al sistema RDV el 08/10/2026. No hace nada: Aux_Maximos la arma el sistema RDV cada hora.');
}
```

  - **`LEGACY.js`**: todo el código viejo de los siete archivos (`Unpivot2.js`, `Auxiliar.js`, `Código.js`,
    `Unpivot.js`, `Graficos.js`, `Sin título.js`, `Sin título 2.js`), comentado línea por línea, con un encabezado: qué
    hacía, la fecha de la migración, dónde vive ahora (este repo, `44_Looker.js`) y que no se descomenta;
  - los siete archivos, borrados. Los activadores los borró el usuario (los había armado él).
- Qué mirar después de la primera corrida de la hora: docs/ESTADO.md, 0.z ("El tablero de Looker: PRENDIDO el 08/10").
