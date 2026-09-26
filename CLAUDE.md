# RDV — Reuniones de Vecinos

Proyecto de Google Apps Script que consolida datos de inscriptos y asistentes de las
Reuniones de Vecinos en una planilla única de reporte.

**Estado: en migración.** El código de `main` es el legado auditado en septiembre 2026.
Este documento describe lo que hay, por qué falla y hacia dónde vamos. Leelo entero antes
de tocar nada.

> **¿Retomando después de un rato, o en otra máquina?** Empezá por
> [docs/ESTADO.md](docs/ESTADO.md): dice dónde quedamos, qué hay que correr y qué decisiones
> están esperando un número. Este documento sigue siendo la fuente de verdad sobre **qué hace el
> sistema y por qué**; aquél dice **dónde estamos parados**.

---

## 0. El invariante

> **El pipeline nunca pisa lo que carga el usuario.**

Esta regla está por encima de todo lo demás que dice este documento. Si algo del plan,
de la arquitectura o de una fase choca con ella, **gana el invariante** y lo que se
replantea es lo otro.

**Por qué.** El equipo carga a mano una parte de `RVD JM-CM - ES`. Ese trabajo no es
recuperable: no hay ningún origen del cual volver a sacarlo. Un dato del pipeline que se
pierde se vuelve a calcular corriendo el pipeline; un dato que cargó una persona y se pisó
está perdido y nadie se entera hasta que alguien nota que un número cambió.

### La marca de procedencia

El sistema ya distingue lo suyo de lo ajeno, aunque nunca lo haya leído de vuelta.
[Sinc Base usuario.js:286](Sinc%20Base%20usuario.js#L286) pinta `#4F81BD` cada celda que
escribe, inmediatamente después del `setValue`:

```js
rng.setValue(vPR);
rng.setBackground('#4F81BD'); // azul
```

Verificado sobre la planilla: ese azul aparece **3.779 veces en `RVD JM-CM - ES` y cero
veces en `Para Revisar`**. Es una marca de procedencia real, no decoración. **Se mantiene: mismo
color, se sigue pintando en cada escritura del sistema.** Lo que no hace es decidir si escribir
— ver "Por qué esa regla alcanza", más abajo. El detalle de cuándo pinta hoy y cuándo
no está en [docs/sync-bidireccional.md](docs/sync-bidireccional.md).

### La regla

Toda escritura al destino pasa por un helper único:

```js
setSiDelSistema_(rango, valor)
```

que escribe **sólo si la celda está vacía**, y que pinta `#4F81BD` al escribir.

**Celda con cualquier valor → no se toca.** No importa quién lo puso ni de qué color está.

No hay `setValue` ni `setValues` sueltos contra el destino. Ninguno. Si aparece uno en un
diff, el diff está mal.

### La única excepción: `STATUS REUNIÓN`

Hay **una** escritura que la regla general no puede hacer y que igual hace falta. Está acá
arriba, junto al invariante, y no escondida en el código, porque una excepción que no se
anuncia deja de ser una excepción y pasa a ser un agujero.

**`STATUS REUNIÓN` no es un número cerrado: es un estado que cambia.** Una reunión agendada que
efectivamente ocurrió tiene que pasar a `Realizada`, y "escribir sólo en celda vacía" se lo
impide — la celda ya dice `en agenda`. Sin excepción, el estado se congela en el momento en que
alguien lo carga por primera vez.

La excepción es **una sola transición, en una sola dirección**:

> `en agenda` → `Realizada`, y sólo cuando la fila tiene `Asistentes` cargado.

- nunca al revés;
- nunca hacia ningún otro valor;
- **nunca desde ningún otro estado.** La whitelist es de un único origen. Ver 3.4: hay tres
  estados más —`Suspendida`, `Reprogramada`, `Se modifico el barrio`— que son **decisiones de
  una persona**, y el pipeline no puede pisar una reunión que alguien suspendió a mano;
- nunca desde un estado que el pipeline no conozca: si aparece uno nuevo, se loguea y se deja.

**Vive en `05_Escritura.js` como función aparte, `marcarRealizada_`, y no pasa por
`setSiDelSistema_`.** Es deliberado: la regla general tiene que seguir siendo verificable con un
grep, y una excepción metida adentro del helper la volvería inauditable — el helper diría "sólo
escribo en celda vacía" y sería mentira.

Pinta `#4F81BD` como cualquier otra escritura del sistema: el equipo tiene que poder ver que ese
`Realizada` lo puso el proceso.

#### Por qué esa regla alcanza: los números del sistema son cerrados

El formulario de inscripción **cierra**. Después de eso el total no se actualiza más: los
inscriptos de una reunión del mes pasado son los que son y no van a cambiar. Lo mismo el
desagregado por sexo y edades, que sale de ese mismo total.

Eso simplifica el problema entero. Si el origen no corrige, **no hay nada que propagar**, y por
lo tanto:

- **no hace falta una regla de resolución de conflictos.** No existe el caso "el sistema tiene
  un valor nuevo y mejor que el que está en la planilla";
- **no hace falta distinguir una corrección humana del valor original del sistema.** Da igual
  quién escribió lo que está: si hay algo, es el valor final.

`setSiDelSistema_` queda exactamente como está:

1. escribe **sólo si la celda está vacía**;
2. pinta `#4F81BD` al escribir, como **aviso visual para el equipo**;
3. **lo que ya está cargado no se toca ni se recalcula.** Nunca.

Y por eso mismo el azul **no se consulta para decidir si escribir**. Sería tentador relajar la
regla a "vacío **o** con fondo `#4F81BD`" —total, el azul marca lo que escribió el sistema—
pero eso sólo serviría para reescribir un valor con otro, que es justo lo que no pasa: no hay
valor nuevo. Lo único que se ganaría es el riesgo de pisar algo.

El `#4F81BD` tiene entonces dos usos, los dos de lectura:

- **aviso visual**: alguien mirando la planilla ve de un vistazo qué llenó el proceso y qué no;
- **métrica**: `DIAG_PROCEDENCIA` mide cuánto de las columnas del equipo viene aportando hoy el
  pipeline (sección 3.2).

No decide nada, y no hace falta que decida.

> **Descartado: el `onEdit` que despintaba el azul.** Estuvo un tiempo anotado en la Fase 7.
> Su única razón de ser era volver el fondo confiable como token de permiso, para poder habilitar
> "vacío o azul" y que el pipeline pudiera **propagar correcciones del origen**. Como el origen
> no corrige, no hay correcciones que propagar y el `onEdit` no resuelve ningún problema real:
> agrega un trigger, una forma de romper el formato y una regla más que explicar, a cambio de
> nada. **No reabrirlo.** Lo que sí hace falta —enterarse si un número cerrado se movió— lo
> resuelve `verificarCambiosRecientes_()` (sección 4, decisión 11), que avisa en vez de escribir.

### Tres consecuencias que no son negociables

**a) El cero cuenta como valor escrito.** Escribir `0` sobre una celda vacía la marca como
ocupada y borra la diferencia entre "no hay dato" y "el dato es cero". Por eso **B2 tiene
que guardar celda vacía cuando no hay dato, nunca `0`**. Hoy hace lo contrario: `num()`
convierte vacío en cero en todos lados, y por eso una fila de B2 que llegó sin datos se ve
igual que una que llegó con ceros legítimos. Se arregla en la Fase 2, cuando `01_Utils.js`
reemplaza las nueve copias de `num()`.

**b) No puede haber sincronización bidireccional.** Sincronizar en dos direcciones obliga a
elegir un ganador en cada conflicto, y acá el ganador es siempre el usuario — con lo cual la
dirección destino → origen no tiene nada que aportar y sí mucho que romper. El origen se lee,
el destino se escribe, y las diferencias se reportan en vez de resolverse. Esto es lo que
mata al paso 5 (sección 4, decisión 10).

**c) Las columnas manuales no se escriben ni aunque estén vacías.** Ver `COLUMNAS_MANUALES`
en la decisión 8. El invariante protege celdas; esta lista protege columnas enteras, incluso
antes de que nadie haya cargado nada en ellas.

---

## 1. Planillas

| # | Rol | ID | ¿Somos dueños? |
|---|---|---|---|
| 1 | **Destino final** — workbook "RDV JM-CM - ES / funcionarios" | `1ZpHO6Ru1uY2r9WfBF_yFtu5z7ip7F3Q6VOoRJN5vLAo` | sí |
| 2 | **Intermedia** — "Base intermedia Reuniones de Vecinos". El script está atado acá (`getActive()`) | `1dNLcBjh1ncEVBeALD-szhIlcRGkfOiMaPJp2tGqrsyM` | sí |
| 3 | **Origen inscriptos** — `Hoja1` | `1W7mzk0cTmiabfEMZ56M9pDsqf6jK6I2fDpqbpP3dWQg` | **no** |
| 4 | **Agenda** | `1hP8zMN8Ep7s1w9zb3Fllix2q_OqIhVwkrED0KCoVh4U` | sí |

Solapas que importan:

- **(1) `RVD JM-CM - ES`** → destino final, 41 columnas, 802 filas con datos. **Es el único destino.**
- **(1) `RDV CONJUNTO`** → origen de asistentes (12 col).
- **(1) `Comunas`** → tabla de lookup, A:H. Estable, no cambia.
- **(1) `Para Revisar`** → **staging del pipeline principal**: lo escribe el paso 4
  (`Upset Base FInal.js:7`, `DEST_SHEET_NAME = 'Para Revisar'`) y el paso 5 lo cruza al destino.
  El flujo Agenda **también** escribe ahí (`agenda_pushReadyToBaseFinal`), pero no es su dueño.
- **(2) `B`** → IMPORTRANGE de (3) `Hoja1!A1:R` + `Hoja1!S1:AC`.
- **(2) `Asistentes`** → IMPORTRANGE de (1) `RDV CONJUNTO!A:L`. Antes se llamaba `A`.
- **(2) `A2`, `B2`** → versiones transformadas. `B2` tiene 27 columnas.
- **(2) `import B2 Completo`** → en `#REF!`. Apunta a `'Hoja 1'` (con espacio) y la solapa real
  es `Hoja1`. Está muerta, se elimina.

### Regla dura

**No se modifica nada en (3) ni en `RDV CONJUNTO`.** No se agregan columnas, no se pide un
`evento_id` al origen. Cualquier identidad se genera de nuestro lado.

### Reglas de negocio confirmadas

**a) Una figura no tiene más de una reunión por día.** Confirmado con el equipo.

Es la regla que más simplifica el matching: **`figura + fecha` ya es clave única**. La ubicación
deja de ser parte de la identidad y pasa a ser **sólo confirmación** — sirve para ganar
confianza en un match, no para decidirlo. Eso es lo que permite que el pipeline siga funcionando
ahora que el origen dejó de mandar el barrio (3.3.b).

Consecuencia directa: **el error de parseo de fechas deja de ser un campo mal cargado y pasa a
ser un error de identidad.** Si la fecha está mal, la clave está mal. Ver 3.3.c.

#### Los 8 pares repetidos no son excepciones: son desfase por reprogramación

`diagScores()` contó **8 pares `figura + fecha` con más de una fila en el destino**. Parecían
contraejemplos de la regla. No lo son.

**La reunión se reprograma, y el formulario de inscripción conserva en su nombre la fecha
vieja.** No son dos reuniones el mismo día: son **dos reuniones cuyos formularios quedaron
nombrados con la misma fecha**. Y como la fecha del destino salió del nombre del formulario
—ese es el bug de 3.3.c— las dos filas terminaron con la misma fecha aunque las reuniones
ocurrieron en días distintos.

Encaja con que exista el estado `Reprogramada` en `STATUS REUNIÓN` (3.4). `diagScores()` cruza
los pares contra ese estado para confirmarlo.

**La regla se sostiene. Lo que falla es la fecha, no la clave.** Y eso refuerza la conclusión de
3.3.c: arreglar el parseo de fechas es lo primero, porque estos 8 pares son la misma falla
manifestándose de otra forma.

**b) La comuna del destino no es un dato propio: se deriva del barrio.** La columna `AA (Comuna)`
es una de las once fórmulas de array (3.1.b):

```
={"Comuna"; IFERROR(VLOOKUP(B2:B2374, Comunas!A:B, 2, FALSE),)}
```

**No se puede usar como campo independiente.** Vale la pena decirlo explícito porque invita al
error: comparar comuna contra comuna *parece* una forma de rescatar las filas que no matchean
por barrio, pero `AA` sólo tiene valor **cuando `B (Barrio)` ya tiene valor** — o sea, nunca en
las filas que fallan por barrio. Si el barrio del destino está vacío, la comuna también.

Y en la otra dirección tampoco sirve: **de la comuna no se deduce el barrio.** Cada comuna tiene
entre 2 y 6 barrios. La comuna confirma, nunca identifica.

**c) Del formulario, el año y el mes de `fecha_fin` siempre vienen bien. Sólo el día puede
estar corrido.** Confirmado con el equipo.

Es la regla que **resuelve el parser sin ventana ni tolerancia**, y va acá arriba porque cambia
lo que `detectFecha_` puede afirmar:

| campo | de dónde sale |
|---|---|
| **año** | de `fecha_fin`. **Nunca del texto**, ni siquiera cuando el texto lo trae |
| **mes** | del texto, **sólo si es el de `fecha_fin` o el siguiente**. Si no, esa ocurrencia se descarta y se busca otra |
| **día** | del texto. Es lo único que el nombre del formulario aporta de verdad |

El *"o el siguiente"* cubre el formulario que cierra a fin de mes con la reunión los primeros
días del mes que viene. Va en `00_Config.js` como `MESES_ADELANTE_TEXTO = 1`.

> **Lo que la hace valiosa es que no es una tolerancia: es una imposibilidad.**
>
> Veníamos buscando un ancho de ventana que separara la fecha buena de la mala, y 3.3.c cerró
> con que **ese ancho no existe** — el error vive entre 2 y 7 días, donde recortar no separa
> nada. Esta regla no recorta por distancia: **descarta lo que no puede ser.** Un mes 12 contra
> un `fecha_fin` de abril no es improbable, es imposible, y eso no depende de calibrar nada.
>
> Es la misma forma que el rango del asunto de los mails (3.3.c): **una restricción, no una
> comparación de dos fuentes.** No hay que interpretar cuál de las dos está mal.

**Y resuelve de arriba un problema que parecía otro:** la ambigüedad entre una fecha y un
horario. `"Reunión 10-12 hs"` leía *10 de diciembre* y era el ejemplo canónico del parser roto.
Con la regla, en un formulario de abril el mes 12 se descarta **sin tener que distinguir un
rango horario de una fecha**. No hace falta enseñarle al parser qué es un horario: alcanza con
que ese mes no pueda ser ése.

Los dos outliers de **+303 días** caen igual: `fecha_fin` 2026-02-11 con texto que da mes 12 es
imposible.

**d) No todas las reuniones tienen lugar: hay reuniones temáticas.**

Es una **categoría propia**, y aparece así en el destino:

```
JORGE MACRI - Encuentro Temático "Orden Público"/ Seguridad - Eje Norte - 16/07/2026
```

`Eje Norte` no es un barrio ni una comuna, y `Orden Público / Seguridad` es **el tema**. ~~Para
estas filas **la ubicación no existe como concepto**.~~ *[Corregido: el eje sí acota la
geografía, pero el mapeo eje → comunas no existe en el proyecto. Ver más abajo.]*

> **No confundirla con el barrio ausente de 3.3.b.** Son dos cosas distintas y llevan a arreglos
> distintos:
>
> | | 3.3.b — barrio ausente | 1.d — reunión temática |
> |---|---|---|
> | el dato | **existía y desapareció** cuando cambió el formulario | **nunca existió**: no hay lugar que mandar |
> | el arreglo | conseguir otra señal de lugar — la comuna | el eje, si aparece el mapeo; el tema está en el nombre del formulario, **no en `EVENTO`** |
> | qué queda | una fila sin ubicación, esperando la comuna | una fila con figura + fecha como única evidencia, hasta que haya mapeo de ejes |

~~**Lo que sí tienen es la columna `EVENTO` del destino, y el nombre del formulario repite el
tema.**~~

> **Corrección (medida): `EVENTO` no sirve.** Es una **categoría, no un identificador**: coincide
> por subcadena con **718 de 802 filas** (~90%), y los 12 casos que listó el bloque 2d eran todos
> `Encuentro con Vecinos`. Una señal que coincide con el 90% no discrimina nada. Como vía de
> relevancia de `EMPAREJAR_MANUAL` **subió la densidad de 2,6 a 8,2 pares por fila**; se sacó.
>
> Lo que distingue a una temática está en el **nombre del formulario** —`Temática Salud`,
> `Eje Sur`— no en la columna `EVENTO` del destino (`esFormularioTematico_`, `detectEje_`).

*[Hipótesis sin verificar:]* probablemente expliquen dos números que quedaron sin explicación
en la corrida del 25/09: las **14 filas que "tenían las dos señales y aun así no llegaron"** y
parte de los **formularios huérfanos**. El bloque 2d se pensó para medirlo por `EVENTO`, y
`EVENTO` resultó no discriminar (abajo), así que esta hipótesis sigue sin medir.

**Y muchas traen un eje geográfico, que es ubicación de verdad.**

```
JORGE MACRI - Encuentro Temático "Salud" Jorge Macri Eje Sur - 14/08/2026
```

no trae barrio ni comuna, pero `Eje Sur` **acota la geografía**. De los cuatro candidatos que
colgaban de ese formulario (B fila 730) —Coghlan, Villa Santa Rita, Floresta y Villa
Riachuelo— **Coghlan es zona norte, y el eje solo lo descarta** sin necesitar ninguna otra señal.
Hasta ahora los cuatro competían igual.

- `detectEje_` (`02_Parsing.js`) reconoce `Eje Norte/Sur/Centro/Oeste`. **`Comuna 1 Norte` /
  `Comuna 1N` no son eje** (confirmado): son subdivisiones de la Comuna 1, que está en el
  centro, y tratarlas como Eje Norte descartaría candidatos buenos. Las lee `detectComuna_`
  como **comuna 1**, descartando el sufijo; `Comuna 1N` antes no la tomaba ninguna regex.
- **La correspondencia eje → comunas no estaba escrita en ningún lado del proyecto.** La
  candidata era la columna `Zona` de `Comunas` (la 8, la que lee la fórmula de `AG`).
  **Medido (bloque 2e, 25/09): `Zona` no es el eje.** Tiene tres valores —`Centro`
  (comunas 1,3,5,6,7,10,11,15), `Norte` (1,2,12,13,14), `Sur` (4,8,9)— y **no tiene `Oeste`**,
  aunque 6 formularios dicen `Eje Oeste` (cruce: `Oeste × Centro 29 · × Norte 13 · × Sur 12`);
  un formulario dice `Eje Este`, que tampoco está. Encendido, el eje descartaría el **82,5%** de
  los pares de la ventana, incluidos candidatos a 0 días. **Queda descartado por falta de
  mapeo** hasta que el equipo pase uno (docs/HANDOFF-2026-09-25.md, sección 4).
- Entra como vía de ubicación con **0,10** (barrio 0,25 · comuna 0,15 · eje 0,10), porque un eje
  contiene varias comunas, y **descalifica** si el barrio del destino es de otro eje, igual que
  `comuna_distinta`. Detrás de `EJE_COMO_UBICACION = false` hasta confirmar el mapeo.

> **Y ojo con la fecha de ese caso.** Los cuatro candidatos de la fila 730 están a **7, 7, 11 y
> 13 días** del formulario. Descartar Coghlan no hace que ninguno de los otros tres sea la
> reunión: probablemente el formulario corresponda a una fila que no está en la lista, o a
> ninguna. El bloque 2e reporta, para cada formulario temático, si existe **alguna** fila de su
> figura a ±`DIAS_TEMATICA_CERCANA` (3) días. **Si no existe, es un huérfano real** y ningún
> peso de ubicación lo rescata.

**e) Qué hace B2 hoy, y qué queda de cada cosa.** B2 hace **cuatro** cosas distintas, y tienen
destinos distintos. Están escritas acá antes de tocar nada, porque dos de ellas son lógica de
negocio real que **hoy existe sólo adentro de `syncB_to_B2`** y se perdería con el archivo.

> **B2 se conserva, pero cambia de naturaleza: pasa a ser vista de lectura, no superficie de
> corrección.**

**1. Colapsa 8 canales del origen en 5.** Es negocio, no plumbing, y está confirmado
([Sync B to B2.js:117-121](Sync%20B%20to%20B2.js#L117)):

| columna del destino | columnas de `B` que suma |
|---|---|
| `Mail` | `Inscriptos canal Mailing` |
| `Call Center` | `Inscriptos canal Call Center` |
| `IVR` | `Inscriptos canal IVR` |
| `RRSS` | `Facebook` + `Google` + `Programmatic` |
| `Difusión` | `Difusion` + `Otros` |

**Se conserva.** Vive en `MAPEO_CANALES` en `00_Config.js`.

**2. Escala el sexo, y NO escala las edades.** La asimetría es real y hay que conocerla.

```
Masculinos = round(Inscriptos × Inscriptos M / Inscriptos unicos identificados)
Femeninos  = round(Inscriptos × Inscriptos F / Inscriptos unicos identificados)

18-24 … 66+     se copian CRUDAS de B, sin escalar
Sin identificar = max(0, Inscriptos − suma de las cinco bandas)
```

> **El sexo queda a escala de `Inscriptos` y las edades a escala de `identificados`**, con la
> diferencia empujada a `Sin identificar`. No es un descuido de la descripción: es lo que hace
> el código, y explica por qué `DIAG_ATOMICIDAD` ve `suma_sexo` y `suma_edades` comportarse
> distinto contra el mismo total.
>
> **No se cambia**: tocar el criterio cambiaría números ya publicados. Se documenta y listo.
>
> ⚠️ **No hay categoría X.** `B` sólo trae `Inscriptos M` y `Inscriptos F`. Si el origen empieza
> a mandar una tercera, hoy no se lee y nadie se entera.

**Se conserva.** En `escalarSexo_` y `sinIdentificar_`, en `00_Config.js`.

**3. Era la superficie de corrección** — `Persona (manual)`, `Barrio (manual)`,
`Fecha (manual)`, `BarrioN`. **Se elimina.**

Esas columnas existían porque **el destino no se podía corregir con seguridad**: fórmulas de
array que se rompen (3.1.b), sincronización bidireccional (paso 5) y cero trazabilidad. Ninguna
de las tres condiciones sigue en pie — el destino ahora tiene `form_origen`, `RDV_UID`,
`setSiDelSistema_` y `EMPAREJAR_MANUAL`.

Y había un problema más de fondo: **corregían qué persona, barrio o fecha representa el
formulario**, y esa corrección después tenía que **matchear por clave natural** contra el
destino — que es exactamente el paso roto (3.2). Se corregía de un lado para que un eslabón
frágil lo llevara al otro.

`EMPAREJAR_MANUAL` **nombra la fila del destino directamente**. Misma corrección, sin el
eslabón. → **Una sola superficie de corrección, y está en el destino.**

**4. Claves y estado** — `ID`, `KEY`, `Clave PIM`, `Procesado BF`, `Fecha C`. **Se eliminan.**
Las tres primeras son las claves naturales rotas; `Procesado BF` ya estaba descartado
(decisión 6). `RDV_UID` los reemplaza a todos.

#### B2 se reconstruye entera en cada corrida, sin upsert y sin claves

Con qué queda:

```
Nombre | Mail | Call Center | IVR | RRSS | Difusión | Inscriptos
       | Masculinos | Femeninos | 18-24 … 66+ | Sin identificar
       | Persona | BarrioN | Comuna | Fecha        ← lo que el parser entendió
       | RDV_UID | form_score                      ← a qué fila del destino se asoció
```

#### Por qué se conserva materializada y no sólo en memoria

Escrito acá a propósito, porque **sin este motivo alguien la va a querer borrar**: ya no es
superficie de corrección, ya no tiene claves, y parece un intermedio que se podría calcular al
vuelo.

> **Es el único lugar donde se ve qué entendió el pipeline de cada formulario.**

Cuando un dato salga mal, B2 es lo que permite distinguir **si falló la lectura, la
transformación o el match**: `Nombre` muestra lo que llegó, las columnas de canal y sexo
muestran lo que se transformó, y `Persona`/`BarrioN`/`Comuna`/`Fecha` muestran lo que el parser
entendió. Sin eso, un número raro en el destino no tiene cómo rastrearse hasta su causa.

Cuesta nada y ahorra mucho.

> **Consecuencia que hay que tener presente: se pierde el historial.** Reconstruir entera cada
> vez significa que **si un formulario desaparece del origen, desaparece de B2**. Con
> `form_origen` guardado en el destino eso ya no importa para la trazabilidad —el texto del
> formulario queda del lado del destino, que no se reconstruye— pero **es un cambio real
> respecto de hoy** y conviene saberlo antes de extrañar una fila.

---

## 2. Flujo actual

> ### ⏸ El pipeline está frenado, a propósito
>
> **Al 24/09/2026 hay un solo activador vivo en todo el proyecto**:
> `syncAgendaSheetInBaseFromAgenda_2`, que arma una solapa espejo y no escribe datos nuevos.
> Los otros tres están apagados:
>
> | función | estado | tasa de error que traía |
> |---|---|---|
> | `runFullPipelineWithDelays` | APAGADO 24/09/2026 | 100% |
> | `syncManualCorrections_B2` | APAGADO 24/09/2026 | 24,22% |
> | `syncBarriosFromBaseToAjusteRDV` | APAGADO 24/09/2026 | **0%** |
>
> **Esto no es una falla: es un estado elegido.** Un pipeline que lleva meses sin correr, sobre
> datos que se movieron todo ese tiempo, escribiendo con el upsert legado —el que no tiene
> `setSiDelSistema_`— haría más daño encendido que apagado. Se enciende de nuevo en la Fase 2,
> y recién después de `setSiDelSistema_`.
>
> **Consecuencia que hay que tener presente en todas las decisiones: el hueco de sexo/edades no
> se llena solo.** Nada lo está completando hoy y nada lo va a completar hasta la **Fase 6**. Si
> alguien pregunta por qué siguen faltando datos, la respuesta es esta y es intencional.
>
> `syncBarriosFromBaseToAjusteRDV` es el caso a mirar: venía en **0% de error**, o sea que
> andaba. Queda **pendiente de evaluar**, no dado de baja — ver
> [docs/triggers-legado.md](docs/triggers-legado.md).
>
> *Nota:* hay tres copias de `legToDate_` en el legado; hoy no afecta (medido el 25/09), pero es
> un riesgo latente. Ver *"Pendiente: los `leg*_` duplicados"* en la Fase 2.
>
> Lo que sigue describe el pipeline **como está escrito**, no como está corriendo.

`runFullPipelineWithDelays()` en `Completo.js`, cinco pasos con `Utilities.sleep()` entre medio:

```
1  syncA_to_A2_upsert              Sinc A to A2.js
2  syncB_to_B2                     Sync B to B2.js
3  normalizeBarriosToBarrioN_A2B2  Barrios.js
4  upsertBaseFinal_A2_B2           Upset Base FInal.js   → 'Para Revisar'   (staging, en (1))
5  syncBaseFinal_ParaRevisar_y_RVD Sinc Base usuario.js  → 'Para Revisar' ⇄ 'RVD JM-CM - ES'
```

**Entre B2 y el destino hay dos saltos, no uno.** El paso 4 no toca `RVD JM-CM - ES`: escribe
en `Para Revisar`, que es una solapa de staging dentro de la misma planilla (1)
([Upset Base FInal.js:7](Upset%20Base%20FInal.js#L7), `DEST_SHEET_NAME = 'Para Revisar'`).
Recién el paso 5 cruza al destino, y lo hace **en las dos direcciones**, con reglas distintas
según el sentido.

Esto importa para leer cualquier diagnóstico: una fila puede estar completa en B2 y faltar en
el destino porque se cortó en `B2 → Para Revisar` **o** porque se cortó en
`Para Revisar → RVD JM-CM - ES`, y son dos causas distintas con dos arreglos distintos. Por eso
la Fase 1 mide los dos saltos por separado.

Las reglas del paso 5, leídas línea por línea, están en
[docs/sync-bidireccional.md](docs/sync-bidireccional.md). El resumen: escribe al destino sólo
sobre celda vacía, y sólo ahí pinta `#4F81BD`; en el otro sentido copia al staging únicamente
valores no numéricos; cuando los dos lados tienen valor y difieren, no escribe y lo reporta.

Flujo Agenda, separado:
Gmail → `Agenda traer datos del mail.js` → solapa `Agenda` en (4) → `Agenda push a base.js`
→ `Para Revisar` en (1).

> **Corrección: "funcionando" era demasiado generoso.** De sus tres pasos, **sólo el espejo
> tiene activador.** La ingesta desde Gmail y el push a `Para Revisar` corren únicamente si
> alguien los ejecuta a mano desde el editor. Y la ingesta **falla en silencio** si cambia el
> formato del mail: devuelve cero eventos, muestra un `toast` de cuatro segundos y termina bien.
>
> Lectura completa en [docs/agenda-legado.md](docs/agenda-legado.md), que también documenta que
> **la clave del mail (`persona|fecha|hora`) es la mejor del proyecto**, porque no usa barrio y
> no depende de canonizar nada.

No hay `onOpen()` ni triggers declarados en código. Todo corre por activadores cargados a
mano en la UI del editor.

---

## 3. Hallazgos de la auditoría (2026-09)

### 3.1 Bloqueantes

**a) El paso 1 está roto, y el pipeline entero falla el 100% de las veces.**

[Sinc A to A2.js:3](Sinc%20A%20to%20A2.js#L3) tiene `const SRC_SHEET = 'A'` y la solapa se
renombró a `Asistentes`. Tira `throw new Error('No existe la hoja "A".')` y corta el pipeline en
el **primer paso de cinco**.

> **Confirmado contra las ejecuciones: `runFullPipelineWithDelays` tiene una tasa de error del
> 100%.** No es intermitente ni depende de los datos. Muere siempre en el mismo lugar, antes de
> llegar a `syncB_to_B2`.

La consecuencia que hay que tener presente en todo lo demás: **B2 no se está actualizando.** No
es que se actualice mal — no se actualiza. Todo lo que hay en B2 llegó por corridas manuales de
`syncB_to_B2`, o es anterior al renombre de la solapa.

Una línea de una constante tira los cinco pasos. Y como el error queda en un log que nadie mira
(3.1.d es el mismo patrón), estuvo fallando sin que nadie se enterara.

**b) Las fórmulas del destino impiden escribir.** En `RVD JM-CM - ES`, once columnas son
fórmulas de array que viven **en la celda del encabezado** y se expanden hacia abajo:

| col | fórmula |
|---|---|
| `D` Día de la semana | `={"Día de la semana"; IF(E2:E2374="","",TEXT(E2:E2374,"dddd"))}` |
| `W` % de Asistencia | `={"% de Asistencia"; IF(LEN(K2:K2374)=0,"",IFERROR(Q2:Q2374/K2:K2374,...))}` |
| `X` Direccion2 | `={"Direccion2"; IF(G2:G2374="","",G2:G2374&", Buenos Aires, ...")}` |
| `Y` Falta Informacion | `={"Falta Informacion"; IF(K2:K2374="","","No")}` |
| `AA` Comuna | `={"Comuna"; IFERROR(VLOOKUP(B2:B2374, Comunas!A:B, 2, FALSE),)}` |
| `AB`–`AF` | `VLOOKUP($B, Comunas!$A:$G, 3..7)` → Poblacion, p.Mujer, P.Varon, km2, hab/km2 |
| `AG` Zona | `={"Zona"; IFERROR(VLOOKUP(B2:B2374, Comunas!A:Z, 8, FALSE),)}` |

Un `setValue()` en cualquier celda de esas columnas rompe el array completo
(*"Array result was not expanded because it would overwrite data"* → `#REF!` en todo el bloque).
Además están clavadas hasta la fila **2374**: la fila 2375 en adelante no recibe nada, en silencio.

→ **Decisión: reemplazar las once por valores escritos desde el script.** Las cuatro primeras
son aritmética de la misma fila; las siete restantes son un `VLOOKUP` contra `Comunas!A:H`
que se resuelve leyendo esa tabla una vez a un `Map`.

**c) Colisiones en el scope global.** Apps Script comparte un único scope entre todos los `.gs`.
Hay declaraciones repetidas: `normalizeHeader_` ×10, `toDate_` ×9, `str`/`num` ×9/×7,
`normalizeText_` ×7, `findIdxOr_` ×6, `ensureHeaders_` ×5, `mapBarrioCanon_` ×2.
Gana la última que carga, y el orden de carga es el orden de archivos del proyecto —
no está en el repo y cambia si alguien arrastra un archivo en el editor.

El caso grave es `toDate_`, porque decide la clave:

```js
// Upset Base FInal.js  → día primero.  03/04/2025 = 3 de abril
const m = /^\s*(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?\s*$/.exec(String(v));

// Sync B to B2.js      → motor de JS.  03/04/2025 = 4 de marzo
if (typeof val === 'string') { const d = new Date(val); ... }
```

Del día 1 al 12 de cada mes la fecha puede quedar corrida de mes según el orden de carga.
Es el origen probable del "a veces funciona".

Aparte, `Upset Base FInal.js` define `runUpsertAndNormalize`, `logDbg`, `ensureColumnsExist_`,
`setIfIndex_`, `_normNoAccents_`, `mapStatusToAllowed_`, `findIdxOr_` y `normalizeHeader_`
**dos veces dentro del mismo archivo** (bloque duplicado desde la línea 413).

**d) Lo que no matchea se pierde sin ruido.** En `upsertBaseFinal_A2_B2`:

```js
const dRow = keyToRow.get(key);
if (!dRow) { skippedB++; SKIP_CAUSES.noKeyDest++; continue; }
```

No hay camino de inserción. Si la reunión no existe todavía en el destino, el dato se descarta
y sólo queda un contador en un log que nadie mira.

**e) 676 líneas dentro de comentarios de bloque.**

- `Back up Agenda traer datos del mail.js` — las 340 líneas (abre `/*` en la 1, cierra en la 340).
- `Completo Actualizacion sola.js` — las 54.
- `Carga Manual persona o barrio por equipo/.js` — líneas 265 a 547. Ahí adentro están
  `exportMissingPersonaBarrio_B2_toManualSheet()` e `importManuals_fromManualSheet_toB2()`:
  **esas funciones no existen en runtime.**

**f) `syncB_to_B2` inserta filas que después nadie puede encontrar.**

Lo único que hace saltear una fila del import es que falte `Nombre`
([Sync B to B2.js:132](Sync%20B%20to%20B2.js#L132)):

```js
const key = buildKeyByNombreInscriptos_(nombre, ins);
if (!key) { skipped++; continue; }   // buildKey sólo devuelve '' si no hay nombre
```

Más abajo, cuando `detectPersona_` o `detectBarrio_` no reconocen el texto libre, **la fila se
inserta igual**, con la columna vacía:

```js
const persona = (typeof detectPersona_ === 'function') ? detectPersona_(nombre) : '';
const barrio  = (typeof detectBarrio_  === 'function') ? detectBarrio_(nombre)  : '';
// ...y se escriben así, vacías, en la fila nueva de B2
```

El resultado es una fila que **está en B2 pero no es indexable por la clave natural**
`Persona|BarrioN|Fecha`: le falta uno de los tres componentes. El upsert nunca la encuentra, y
cualquier diagnóstico que indexe B2 por clave natural la cuenta como si no existiera.

**Son las 23 claves incompletas** que midió la Fase 1 (sección 3.2). Y son la razón por la que
`no_existe_en_B2` no quiere decir "la fila no llegó a B2".

→ **Dos ramas de arreglo, con costos muy distintos.** No son alternativas: hay que saber cuánto
pesa cada una antes de elegir por dónde empezar.

| rama | qué es | costo |
|---|---|---|
| **Ampliar las listas fijas** de `detectPersona_` (20 nombres) y `detectBarrio_`, o derivar la figura de otro lado en vez de adivinarla del texto libre | la fila **sí está** en B2, sólo que sin `Persona`/`BarrioN` | **bajo**: es data, no arquitectura. Se puede hacer hoy |
| **Rehacer `syncB_to_B2` como acumulativo** | la fila **no está** en B2 porque ya no está en `B`, y B2 es un espejo del import, no un acumulado | **alto**: cambia el modelo de la solapa y hay que rellenarla hacia atrás |

> **Corrección para el barrio: ampliar `detectBarrio_` no arregla nada.** Las
> `barrio_no_reconocido` son **todas** ausentes: el barrio no viene en `B` desde 2025-10 (3.3.b).
> No hay texto que reconocer. La rama "ampliar listas" sólo aplica a la **figura**. Ahí
> `limpiarPrefijos_` quedó medido y descartado (25/09: 18 formularios en ventana perdían la
> figura, 0 ganaban algo) y ya no se aplica a la figura; las **variantes de grafía** siguen como
> candidata, **sin medir** (docs/HANDOFF-2026-09-25.md, sección 3).

`DIAG_CORTE_B` (Fase 1b) mide el reparto. **Las 23 claves incompletas no alcanzan a explicar 72
filas**, así que hay que esperar las dos causas mezcladas y dimensionar cada una, no elegir la
primera que aparezca.

Mientras tanto, el arreglo de fondo es la decisión 2: con `RDV_UID` la identidad deja de
depender de que una lista fija de nombres reconozca el texto libre.

**g) `marcarRevisadaEnOrden()` reescribe el destino entero y después lo ordena.**

Está en [En agenda a Realizada.js](En%20agenda%20a%20Realizada.js). **Lo que decide está bien**
—es exactamente la transición de la sección 0— pero **cómo escribe es destructivo en dos formas
distintas**, las dos silenciosas.

**1. Escribe de vuelta la planilla completa, fórmulas incluidas**
([líneas 64-84](En%20agenda%20a%20Realizada.js#L64)):

```js
const data = sh.getDataRange().getValues();   // 41 columnas x ~2374 filas, valores calculados
// ... cambia una celda de STATUS en algunas filas ...
sh.getRange(2, 1, out.length, data[0].length).setValues(out);   // y escribe TODO de vuelta
```

Eso escribe **valores literales sobre `D2:D2374`, `W`, `X`, `Y`, `AA`–`AG`** — las once columnas
que son fórmulas de array ancladas en la fila 1 (3.1.b). El bloque se rompe entero. Los valores
se ven iguales porque son los mismos que acababa de leer, así que **el daño no se nota mirando
la planilla**: se nota cuando entra la primera fila nueva y ya no se calcula nada.

> Las once fórmulas hoy están vivas, así que esta función **no corrió nunca contra el destino**,
> o corrió antes de que existieran. Es un arma cargada: alcanza un disparo.

**2. Ordena el destino** ([líneas 39-47](En%20agenda%20a%20Realizada.js#L39)):

```js
sh.getRange(2, 1, lastRow - 1, lastCol).sort([byFecha, byHora, byFig]);
```

`sort()` **mueve los valores y deja los fondos quietos**. Las 3.779 celdas `#4F81BD` quedarían
repartidas sobre filas que no les corresponden, y la marca de procedencia —de la que depende el
invariante entero— se vuelve ruido irrecuperable. Es exactamente lo que prohíbe la sección 6.

Encima ordena hasta `lastRow`, que por las fórmulas es 2374 y no 802: arrastra ~1.570 filas
vacías al ordenamiento.

> **Verificado: `marcarRevisadaEnOrden` NO tiene activador.** Nunca corrió contra el destino y
> las once fórmulas de array están intactas. **Baja de urgente a riesgo latente.**

Sigue siendo un arma cargada —alcanza que alguien la ejecute a mano desde el editor— pero no
hay nada que apagar. El archivo va a `_archivo/` en la Fase 2 como el resto. Lo que la función
decide se rescata en `marcarRealizada_` (sección 0), que escribe una celda por vez y no toca ni
el formato ni el orden.

**h) Dos `mapBarrioCanon_` con listas distintas — y una se contradice a sí misma.**

Es una **fábrica identificada** de las 48 variantes de barrio que cuenta 3.2. No es drift de
tipeo del equipo: lo produce el código.

| dónde | implementación | `Villa General Mitre` → | `Montserrat` → |
|---|---|---|---|
| [Barrios.js:45](Barrios.js#L45) | `CANON` + `ALIAS` propios | `Villa Gral. Mitre` | `Monserrat` |
| [Solapa agenda base final.js:214](Solapa%20agenda%20base%20final.js#L214) | delega en `canonBarrio_` | **`Villa Gral. Mitre`** | `Monserrat` |

Hasta ahí, coinciden. El problema está adentro del segundo, en
[la línea 182](Solapa%20agenda%20base%20final.js#L182):

```js
['villa gral mitre','Villa General Mitre'], ['villa general mitre','Villa Gral. Mitre'],
```

**Las dos entradas están cruzadas.** `villa gral mitre` devuelve `Villa General Mitre`, y
`villa general mitre` devuelve `Villa Gral. Mitre`. Cada escritura del barrio **alterna entre
las dos formas según cómo venía escrito**, y ninguna converge.

Peor: `'Villa General Mitre'` **no está en su propia `CABA_BARRIOS_CANON`**, que tiene
`'Villa Gral. Mitre'`. El alias produce un valor que su propia lista canónica no reconoce, así
que una segunda pasada sobre ese valor lo vuelve a cambiar.

**Por qué es bloqueante y no una curiosidad:**

- las dos funciones se llaman igual, así que **cuál corre depende del orden de carga** (3.1.c),
  que no está en el repo;
- los dos archivos que las definen **tenían activador**;
- `syncManualCorrections_B2` la usa para escribir **`BarrioN` en B2**, que es la mitad de la
  clave natural, y `agenda_pushReadyToBaseFinal` la usa para escribir **`Barrio` en
  `Para Revisar`**;
- `Villa Gral. Mitre` y `Villa General Mitre` son **exactamente las dos variantes que 3.2 cuenta
  como barrios distintos**.

→ **Una sola implementación, una sola lista, en `02_Parsing.js`** (Fase 2). Las otras se borran.
Y antes de reescribirla hay que decidir cuál es la forma canónica —`Villa Gral. Mitre` o
`Villa General Mitre`, `Monserrat` o `Montserrat`— porque el destino hoy tiene las dos.

**i) `syncManualCorrections_B2` borra filas invalidando su propio índice.**

[Carga Manual persona o barrio por equipo/.js](Carga%20Manual%20persona%20o%20barrio%20por%20equipo/.js),
todo dentro del mismo loop:

```js
const idToRowM = new Map();            // línea 76: ID → fila del sheet
...
const existsM = idToRowM.get(id);      // línea  97
...
manSh.deleteRow(existsM);              // línea 132  ← corre todas las filas de abajo
```

Después del primer `deleteRow`, **cada fila por debajo se corrió una posición** y el mapa quedó
viejo. Las iteraciones siguientes leen y escriben en la fila equivocada.

**No tira error: escribe mal en silencio.** Y está en la función que escribe `BarrioN` en B2,
o sea que el daño cae sobre la mitad de la clave natural. Análisis completo en 3.6.

El segundo bloque de borrados del mismo archivo (líneas 197-200) **sí está bien hecho**: ordena
descendente antes de borrar. Es la misma operación resuelta bien a diez líneas de distancia.

### 3.2 Calidad de datos, medida

> ## 🔴 No hay clave natural
>
> No es un riesgo a futuro ni una fragilidad: **es el estado del proyecto hoy.** Los tres campos
> con los que el código arma la clave están rotos o ausentes, y el cuarto nunca alcanzó solo.
>
> | campo | estado |
> |---|---|
> | **barrio** | ausente en `B` desde 2025-10 — 0% → 54% → 93% → **97%** |
> | **fecha del nombre del formulario** | era no confiable: rango inflado hasta el 18/12/2026. **Con la regla del mes (1.c) es la fuente**. Las 20 que parecían mal parseadas eran reprogramación: el destino corrido 1-3 días (3.3.c) |
> | **`fecha_fin`** | no es la fecha de la reunión: es **el cierre del formulario**, otra magnitud (3.3.c). Da año y mes, y es respaldo |
> | **figura sola** | no identifica |
>
> **Esto explica todo lo demás.** No son tres problemas sueltos que fuimos encontrando: son un
> solo problema visto desde tres lados.
>
> - las **79 filas** sin sexo ni edades → no hay con qué emparejarlas;
> - las **14 claves duplicadas** en B2 → la clave que usa no distingue;
> - el **hueco que crece mes a mes** → cada formulario nuevo trae menos con qué identificarse.
>
> **Consecuencia para el plan: `RDV_UID` deja de ser la mejor opción y pasa a ser la única.**
> No hay un plan B que consista en arreglar la clave natural, porque los campos que la formaban
> no van a volver. Ver la decisión 2 y la Fase 4.



Destino `RVD JM-CM - ES`, 802 filas con datos, fechas 05/07/2025 → 24/09/2026:

- clave natural `Figura|Barrio|Fecha` completa: **793** (faltan 9, todas por Barrio vacío)
- claves naturales **duplicadas: 0** → la clave natural es única hoy, sirve como puente
- columna `Z (ID)`: 612 de 802 con formato roto (`Jorge Macri |  |  |  | `). Inservible como clave,
  pero es columna literal, el script puede reescribirla.
- 48 variantes distintas de Barrio, con drift (`villa gral. mitre` vs `Villa General Mitre`).

**El hueco a llenar:**

| mes | filas | sin Inscriptos | con Ins. y sin Sexo | sin Edades | sin Canales |
|---|---|---|---|---|---|
| 2026-04 | 55 | 0 | 6 | 6 | 0 |
| 2026-05 | 50 | 0 | 7 | 7 | 0 |
| 2026-06 | 55 | 0 | 11 | 11 | 0 |
| 2026-07 | 46 | 0 | 12 | 12 | 0 |
| 2026-08 | 48 | 4 | 7 | 7 | 0 |
| 2026-09 | 36 | 13 | 20 | 20 | 0 |
| **total** | **802** | **17** | **79** | **79** | **0** |

**Las columnas de canales (`Mail`, `Call Center`, `IVR`, `RRSS`, `Difusión`) las carga el equipo
a mano.** Por eso nunca figuran vacías, y por eso su completitud **no dice nada** sobre la salud
del pipeline.

Sexo y edades son las únicas columnas que dependen puramente del proceso automático, así que
son el único indicador real de si el pipeline funciona. Faltan **siempre juntas** (mismo número
exacto), lo que apunta a una falla única de la cadena B2 → destino y no a un problema por columna.

Tasa de falla del pipeline, por mes: 11% en abril, 20% en junio, 26% en julio, **56% en septiembre**
(20 de 36 filas). Está empeorando. El resto de la planilla se ve completa porque el trabajo manual
la cubre.

Causas candidatas, a discriminar en la Fase 1 sin presuponer ninguna: la fila no llega a B2;
llega vacía; llega completa pero el flag `Procesado BF = TRUE` impide reprocesarla; o la clave
natural no matchea contra el destino.

#### Resultado del diagnóstico (2026-09-22): el corte está en `B → B2`

`DIAG_HUECO`, 79 filas analizadas:

| diagnostico | filas | % |
|---|---|---|
| `no_existe_en_B2` | **72** | 91,1% |
| `clave_incompleta` | 7 | 8,9% |
| `B2_vacio_tambien` | 0 | — |
| `corte_B2_a_PR_flag_TRUE` | 0 | — |
| `corte_B2_a_PR_flag_FALSE` | 0 | — |
| `corte_PR_a_destino` | 0 | — |

Conteos de contexto:

```
Destino:        802 filas con datos (getLastRow=2374)
B2:             714 claves únicas · 14 duplicadas · 23 con clave incompleta
Para Revisar:   802 claves · 0 duplicadas
Inscriptos > 0 con las ocho columnas de sexo/edad exactamente en cero: 1
```

**El staging no pierde datos.** Cero cortes en el paso 4 y cero en el paso 5. Las dos causas
candidatas que apuntaban al flag `Procesado BF` y al match de la clave natural contra el destino
quedan **descartadas**: ninguna fila del hueco llegó a B2 con datos.

**El corte está en `B → B2` o antes.** B2 tiene 714 claves contra las 802 del destino: le faltan
~88, del mismo orden que las 72. Lo que falta nunca entró.

> **Ojo con atribuirle las 72 al barrio.** Hay una segunda causa, y explica algo que el barrio
> no explica.
>
> El barrio dejó de venir en **2025-10** (3.3.b): eso es un escalón, y debería producir un nivel
> de falla parejo desde entonces. Pero la tasa de falla **acelera** — 11% en abril, 20% en junio,
> 26% en julio, 56% en septiembre. Un escalón no produce una rampa.
>
> Lo que sí la produce: **el pipeline falla el 100% de las veces** (3.1.a), así que **B2 no se
> actualiza**. Cada mes que pasa, B2 se queda más atrás del destino, y la proporción de filas
> del destino sin contraparte crece sola. **La rampa es el pipeline caído, no el barrio.**
>
> Las dos causas conviven y hay que dimensionarlas por separado: `DIAG_CORTE_B` separa
> `no_esta_en_B` (el dato no llegó al import) de `persona_no_reconocida` /
> `barrio_no_reconocido` (llegó pero no se pudo indexar). La primera es la que crece con el
> pipeline caído.

> **Ninguna fila del destino es irrecuperable.** La corrida en seco del 25/09 dio
> **`0 sin_candidatos`**: para las 802 filas el sistema puede proponer al menos un candidato.
> Las 103 que no se escriben solas **tienen candidato y lo rechaza el umbral** (Fase 5).
>
> Lo irresoluble son **11 formularios huerfanos** — del lado del origen, no de la base. Es un
> conjunto chico y enumerable, y el log los lista uno por uno con fecha, inscriptos y nombre.
> Eso es una conversacion con quien carga los formularios, no un problema de codigo.

**`Para Revisar` es un espejo del destino**, no un reservorio: 802 claves, las mismas, cero
duplicadas. No tiene filas que el destino no tenga, así que **no sirve como fuente del backfill**
— hay que ir a `B` y, si hace falta, al origen.

**14 claves naturales duplicadas en B2.** Deja de ser una preocupación teórica: es evidencia
directa del problema de la clave `nombre|inscriptos` (decisión 3). Cuando `Inscriptos` cambia
entre dos corridas, la clave cambia y `syncB_to_B2` inserta una fila nueva en vez de actualizar
la que ya estaba. Se listan en `DIAG_DUP_B2`.

> #### Las 14 duplicadas y las 23 incompletas no se arreglan: dejan de poder existir
>
> **B2 se reconstruye entera en cada corrida desde `B`, sin upsert y sin claves** (sección 1.e).
> Y eso mata las dos cosas **por construcción**, no por una corrección:
>
> - **no hay clave contra la cual duplicar.** Una fila de `B` es una fila de B2. Si `Inscriptos`
>   cambia, la fila se reescribe, no se agrega otra;
> - **no hay clave que pueda quedar incompleta.** `Persona` y `BarrioN` pasan a ser *lo que el
>   parser entendió*, columnas informativas. Que vengan vacías ya no vuelve la fila
>   inencontrable, porque nadie la busca por ahí — la identidad es `RDV_UID`.
>
> **Es la diferencia entre arreglar un bug y eliminar la categoría del bug.** Un upsert con
> clave sobre datos sin clave estable siempre va a tener duplicados y huérfanos; el arreglo no
> es una clave mejor, es no necesitar clave.
>
> ⚠️ **Cuando mires los reportes después del cambio, esos dos números van a desaparecer.** No es
> que el diagnóstico se rompió: es lo esperado. `DIAG_DUP_B2` debería quedar vacío, y las claves
> incompletas dejan de contarse porque la clave ya no existe.

**Las 23 claves incompletas en B2 son una causa aparte, no un detalle.** Esas filas **están en
B2** pero sin `Persona` o sin `BarrioN`, así que no se pueden indexar y el upsert nunca las
encuentra — ver el bloqueante **3.1.f**. Es distinto de "no llegó", y `DIAG_CORTE_B` lo separa
(`persona_no_reconocida` / `barrio_no_reconocido`). 23 no alcanzan para 72: hay dos causas
mezcladas.

El seguimiento está en [docs/prompts/PROMPT-02-CORTE-B.md](docs/prompts/PROMPT-02-CORTE-B.md) y
lo mide `diagnostico/02_corte_B_a_B2.js`.

#### Los dos totales que no coinciden: estado heredado, no bug

`DIAG_TOTAL_DIVERGENTE` dio **72 filas** donde el `Inscriptos` del destino no es el mismo número
que el `Inscriptos` de B2. El contraste con `DIAG_ATOMICIDAD` dice qué son:

| comparación | filas que no cuadran |
|---|---|
| suma de canales ≠ `Inscriptos` del destino | **3** |
| suma de sexo ≠ `Inscriptos` del destino | **72** |

Los canales y el total **los carga la misma persona**, así que cierran entre sí: 3 de 802 es
ruido de tipeo. El desagregado de sexo y edades **lo calcula el sistema**, y lo calcula bien —
`syncB_to_B2` hace `Math.round(ins × nM / unique)` sobre el `Inscriptos` **del origen**, y el
resultado cuadra contra ese número. **No hay bug de reparto.**

Lo que hay son **dos números distintos conviviendo en la misma fila**: el total que ve la gente,
escrito a mano, y un desagregado calculado contra otro total. Las 72 filas **quedan así**. No se
recalculan: el formulario cerró, el desagregado del origen es el que es, y reescribirlo sobre un
total manual sería inventar un reparto que nadie midió.

**La regla nueva evita que se repita**, sin necesidad de ninguna lógica extra:

- si el total ya está cargado, el sistema **no escribe** el desagregado (`Inscriptos` es
  `COLUMNAS_MANUALES`, y `setSiDelSistema_` no toca celdas con valor);
- si está vacío, lo escribe él, contra su propio total, y los dos números son el mismo.

#### `DIAG_PROCEDENCIA`: cuánto aporta el pipeline, no cuánto pisa

**605 celdas azules** en las seis `COLUMNAS_MANUALES`, y **0 celdas vacías con azul**.

Ese cero confirma la lectura: el paso 5 escribe **sólo sobre celda vacía**, así que las 605 son
**huecos que el sistema rellenó**, no cosas que pisó. Por eso la métrica se llama **aporte del
sistema** y no "pisado" — la primera versión del reporte la etiquetó mal.

Por columna, las que más dependen del pipeline:

| columna | aporte del sistema |
|---|---|
| `IVR` | 28% |
| `Call Center` | 26% |
| `Difusión` | 14% |

**La consecuencia es incómoda y hay que decidirla, no descubrirla en producción.** Con
`COLUMNAS_MANUALES` intocables (decisión 8), ese aporte **desaparece**: más de una cuarta parte
de `IVR` y de `Call Center` la venía llenando el proceso. Dos salidas, y hay que elegir una:

- **reemplazarlo con carga humana**, sabiendo que son ~605 celdas por ciclo de vida de la
  planilla y que alguien tiene que hacerse cargo;
- **decidir explícitamente que se pierde**, y asumir que esas columnas van a quedar más vacías
  que hoy.

Lo que no se puede es dejarlo implícito. Si nadie decide, el equipo va a ver columnas que antes
se llenaban solas y ahora no, sin saber por qué.

**Riesgo adicional:** el upsert escribe las columnas de canales sin condición
(`setIfIndex_(dest, dRow, D.Mail, mail)`). Si el pipeline corre después de que alguien cargó un
valor a mano, lo pisa con lo que venga de B2 — incluido un cero.

> **Corrección (post-lectura del paso 5).** Ese pisado **hoy se detiene en `Para Revisar`**.
> El paso 4 escribe los ceros de B2 en el staging sin preguntar, pero el paso 5 sólo completa
> celdas **vacías** del destino, así que el trabajo manual de `RVD JM-CM - ES` está protegido
> — por accidente de esa regla, no por diseño, y nadie lo escribió en ningún lado.
>
> La consecuencia es incómoda: **sacar el staging (decisión 10) es exactamente el cambio que
> rompería la protección**, si el upsert nuevo hereda el `setIfIndex_` del legado. Por eso
> `setSiDelSistema_` (sección 0) no es una mejora opcional sino la condición previa para poder
> eliminar el paso 5. Las columnas manuales ya están confirmadas: ver `COLUMNAS_MANUALES` en la
> decisión 8.

### 3.3 Fragilidades del origen

- `B` tiene `Persona`/`Barrio`/`Fecha` escritas a mano en las columnas S, T, U, encajadas entre
  el IMPORTRANGE de `A1:R` y el de `s1:AC` (col V). Si el origen agrega una columna, el primer
  IMPORTRANGE intenta expandirse a S y todo el bloque tira `#REF!`. Esas derivadas se mudan a B2.
- IMPORTRANGE se recalcula asincrónico. El script puede leer `B` mientras muestra `Loading...`
  y procesar filas vacías creyendo que no hay datos.
- **El bug de fechas es una inversión de prioridad, no un regex flojo.**
  [Sync B to B2.js:162-163](Sync%20B%20to%20B2.js#L162):

  > ⚠️ **Lo que sigue, hasta *"CERRADO: el ancla de fechas queda DESCARTADA"*, es la historia de
  > una hipótesis refutada, no el estado actual.** La premisa —`fecha_fin` es la fecha confiable
  > de la reunión y el texto sólo aporta ruido— es **falsa**: `fecha_fin` es el cierre del
  > formulario, otra magnitud; la fuente es el texto, validado por la regla del mes. Tampoco era
  > una "inversión de prioridad": el orden texto → `fecha_fin` del legado era el correcto; lo que
  > fallaba era aceptar la primera ocurrencia sin validarla. Se conserva como registro
  > (docs/HANDOFF-2026-09-25.md, sección 5).

  ```js
  let fecha = detectFecha_(nombre, defaultYear);        // texto libre, primero
  if (!fecha && fechaFin) fecha = toDate_(fechaFin);    // columna estructurada, de fallback
  ```

  El texto libre gana y `fecha_fin` sólo entra si el regex falla. **Y el regex casi nunca
  falla**, así que una columna de fecha estructurada, disponible en el **99%** de las filas,
  prácticamente no se usa. Que `detectFecha_` lea `"Reunión 10-12 hs"` como *10 de diciembre*
  es el síntoma; la causa es que ese resultado le gana a un dato confiable que ya estaba ahí.
  *[Falso: `fecha_fin` no es la fecha de la reunión. Ver el aviso de arriba.]*

  Medido sobre las **1.000 filas de `B`**:

  | | |
  |---|---|
  | filas con fecha en el texto | **743** |
  | dentro de ±3 días de `fecha_fin` | **96,1%** |
  | moda: 0 días | 444 casos |
  | +1 día | 236 casos |

  O sea: **la reunión es el día que cierra el formulario, o el siguiente.** El texto libre no
  aporta información que `fecha_fin` no tenga — sólo aporta ruido. *[Falso: la cercanía entre
  las dos no convierte al cierre en la fecha de la reunión; el texto es la fuente.]* Los outliers incluyen dos de
  **+303 días**: `fecha_fin` 2026-02-11 → texto 2026-12-11, y 2026-02-18 → 2026-12-18. Eventos
  de febrero leídos como diciembre. Son los que estiraban el rango efectivo de `B` hasta el
  18/12/2026 y ensuciaban el cálculo de la ventana del import.

  → ~~**Arreglo en `02_Parsing.js`: `fecha_fin` es el ancla.**~~ *[Descartado; nunca se
  implementó así.]* Se acepta la fecha del texto sólo
  si cae dentro de `[fecha_fin − 2, fecha_fin + 7]`; si no, se usa `fecha_fin` y **se marca la
  fila** para poder auditar cuántas veces pasó. La ventana va en `00_Config.js` como
  `VENTANA_FECHA_TEXTO = {min: -2, max: 7}`, calibrable: es asimétrica a propósito, por el
  sesgo hacia adelante que muestran los 236 casos de +1 día.

  `diagAnclaFecha()` (en `diagnostico/02_corte_B_a_B2.js`) mide cuántas de las
  `fecha_mal_parseada` de `DIAG_CORTE_B` resuelve esta regla, antes de escribirla en el parser.

  > ~~**Corrección: el ancla es MÁS confiable en los casos raros, no menos.**~~ *[Refutado:
  > cero de los desvíos grandes eran `Reprogramada`, y `fecha_fin` no es la fecha de la reunión.
  > Ver "CERRADO", abajo.]*
  >
  > La primera lectura del `0 de 20` fue que el ancla no servía para esos casos. Es al revés.
  >
  > **`fecha_fin` se mueve con la reprogramación; el nombre del formulario no.** Cuando una
  > reunión se reprograma, el formulario sigue llamándose con la fecha vieja y su `fecha_fin`
  > pasa a ser la nueva. O sea que **el desvío grande entre las dos es la firma de una
  > reprogramación**, y en esos casos `fecha_fin` es justamente el dato correcto — el único de
  > los dos que se enteró del cambio.
  >
  > Eso explica el `0 de 20` sin culpar al ancla: **la ventana `[-2, +7]` está mal calibrada
  > para reprogramaciones.** En `DIAG_ANCLA_FECHA` aparecen desvíos de **−8, +8 y +9 días**, que
  > son candidatos a ser exactamente esto y que la ventana angosta rechaza por el motivo
  > equivocado.
  >
  > Es la misma falla que produce los 8 pares repetidos de la sección 1.a: una reprogramación
  > que el nombre del formulario no registró.
  >
  > `diagAnclaFecha()` lo mide de dos maneras: **cruza los desvíos fuera de la ventana contra
  > `STATUS REUNIÓN = Reprogramada`**, y **barre anchos de ±1 a ±21 días** reportando la curva de
  > resueltas y rotas. Todo dentro de la ventana de análisis (sección 3.5). El ancho definitivo
  > sale de esa curva, no de una estimación.

  #### 🔴 CERRADO: el ancla de fechas queda DESCARTADA

  `diagFechaFin()` corrió el 2026-09-25 y cerró la pregunta: **`fecha_fin` no sirve de ancla.**
  (La primera lectura fue "`fecha_fin` no es confiable"; está corregida más abajo — es el cierre
  del formulario, no una fecha de reunión mal cargada.)

  ```
  VENTANA: 223 comparables / 699 con contraparte en B2 | corte 6 meses
  desvío 0 o +1 ............ 56,5%  (de 223)
  desvíos grandes (|d| > 7)      4  ·  de esos, Reprogramada: 0
  |d| <= 7 : Realizada 213 | Suspendida 5 | Reprogramada 1
  |d| >  7 : Suspendida 2  | Realizada 2
  ```

  **Lo decisivo no es el 56,5%: es dónde está el error.** Con sólo **4** desvíos grandes, casi
  todo el 43,5% restante vive en **desvíos de 2 a 7 días**. Y ahí ninguna ventana sirve:

  > Una ventana que acepte ±7 acepta también **cualquier otra reunión de esa figura en esa
  > semana**. **Ninguna ventana discrimina.** El problema no está en los extremos —donde una
  > ventana recorta bien— sino en el medio, donde recortar no separa señal de ruido.

  Y **la hipótesis de la reprogramación no explica nada**: cero de los cuatro desvíos grandes
  están en `Reprogramada`. La corrección que habíamos anotado arriba —que el desvío grande era
  la firma de una reprogramación— **no se sostiene contra los datos**. Los desvíos grandes son
  dos `Suspendida` y dos `Realizada`.

  → **`VENTANA_FECHA_TEXTO` deja de ser una regla de parseo.** Se acabó la idea de anclar la
  fecha a `fecha_fin`.

  > **Corrección (2026-09-25): "`fecha_fin` no es confiable" era la lectura equivocada.**
  >
  > `fecha_fin` no es una fuente poco confiable **de la fecha de la reunión**: es **el cierre
  > del formulario**, otra magnitud. El 56,5% no mide un error de `fecha_fin`; mide cuánto
  > tarda en ocurrir la reunión después de que cierra la inscripción. Tratar las dos como dos
  > estimaciones rivales del mismo dato fue el error de fondo, y de ahí salió la idea de
  > comparar contra las dos quedándose con la más cercana.
  >
  > **La fecha del nombre del formulario es la fuente, y es siempre la más cercana a la
  > reunión.** Lo que la volvía inservible era que el parser aceptaba cualquier ocurrencia
  > (`"10-12 hs"` → 10 de diciembre); con la regla del mes filtrando los meses imposibles, ese
  > argumento ya no aplica.
  >
  > Lo que queda en el código (`02_Parsing.js`):
  >
  > | | |
  > |---|---|
  > | `detectFecha_().mejor` / `fuente` | **primero el texto** (ya validado por la regla del mes); `fecha_fin` **sólo** si no hubo ninguna ocurrencia aceptada |
  > | `distanciaFecha_` | mide **contra esa fecha**, no contra la más cercana de las dos |
  > | `fecha_fin` | aporta año y mes a la regla del mes, y es **respaldo** |
  >
  > La fecha sigue siendo **señal con tolerancia** en el score (decisión 2): la regla del mes
  > garantiza año y mes, no el día.

  **Un sesgo que hay que tener presente al leer el 56,5%:** las 223 comparables salen de las 699
  filas que **sí** matchean contra B2, o sea justamente aquellas donde la clave natural funcionó.
  Es una muestra sesgada hacia el caso bueno. **El número real es peor, no mejor.**

  #### ✅ La solución: la regla del mes (sección 1.c)

  El ancla quedó descartada, pero **el parser igual había que arreglarlo** — 20
  `fecha_mal_parseada` son 20 filas que el matching no puede resolver. Lo que faltaba era una
  regla que no dependiera de calibrar una distancia, y apareció del lado del negocio.

  > **Corrección: esas 20 no eran del parser** — ver *"Las 20 no eran errores de parseo"*, más
  > abajo. La regla del mes sigue siendo correcta (descarta `"10-12 hs"` y los +303 días), pero
  > no es lo que resuelve esas 20: resolvió **0 de 20** porque ahí no había ningún mes mal.

  > **Del formulario, el año y el mes de `fecha_fin` siempre vienen bien. Sólo el día puede
  > estar corrido.**

  Lo que cambia en `_ocurrenciasFecha_` (`02_Parsing.js`):

  | antes | ahora |
  |---|---|
  | la **primera** `d/m` del texto, sea la que sea | se recorren **todas** las ocurrencias |
  | el año del texto si venía, si no el del ancla | el año sale **siempre** de `fecha_fin` |
  | el mes, el del texto | el mes vale sólo si es el de `fecha_fin` **o el siguiente** |
  | una ocurrencia mala arruinaba la fila | una ocurrencia mala **se descarta y se sigue buscando** |

  **Por qué esto sí y la ventana no.** La ventana preguntaba *¿está lo bastante cerca?*, y la
  respuesta no discrimina porque el error vive en el medio. La regla del mes pregunta *¿puede
  ser?*, y eso **no depende de ningún umbral**. Es la diferencia entre una tolerancia calibrada
  y una imposibilidad.

  Los dos casos que teníamos anotados como los peores caen solos:

  ```
  "Reunión 10-12 hs"  con fecha_fin de abril  → mes 12 imposible → se descarta
  fecha_fin 2026-02-11 con texto que da mes 12 → imposible       → se descarta
  ```

  El primero es el que más importa, porque **resuelve la ambigüedad entre una fecha y un
  horario sin tener que distinguirlas**. No hay que enseñarle al parser qué es "10-12 hs":
  alcanza con que ese mes no pueda ser ése en ese formulario.

  **Y se mide, no se supone.** `diagCorteB()` recalcula los casos de fecha con el parser nuevo
  y reporta cuántas de las `fecha_mal_parseada` quedan resueltas, en ventana y en total, más
  las que siguen sin coincidir listadas una por una. Si ese número no es casi todas, la regla
  no es la explicación y hay que mirar esos casos antes de darla por buena.

  `VENTANA_FECHA_TEXTO` queda obsoleta y sin usar: era el ancho que esta regla vuelve innecesario.

  #### Hay una tercera fuente de fecha, y es externa

  Las dos que veníamos discutiendo —el nombre del formulario y `fecha_fin`— salen las dos del
  **mismo origen de inscriptos** (y `fecha_fin` ni siquiera es una fecha de reunión: es el cierre
  del formulario). Buscando otra cosa apareció una
  tercera, en un lugar donde no la estábamos buscando: **el asunto de los mails de agenda lleva
  el rango de la semana.**

  ```
  Agenda Encuentros de vecinos con {GRUPO} - Semana del 14/10 al 20/10
  ```

  Es una **restricción externa** sobre las fechas de los eventos de ese mail: no la genera el
  formulario, no la toca quien carga inscriptos, y viene en el asunto y no en un texto libre que
  alguien tipea. Un evento fechado fuera del rango de su propio asunto está mal parseado, y eso
  se sabe **sin cruzarlo contra nada**.

  → **Candidato a ancla de fecha para la Fase 8**, ya disponible en las columnas `semana_desde`
  y `semana_hasta` de `DIAG_MAILS`.

  Y el punto general, que vale más que el caso: **las fechas confiables existen, pero hay que
  buscarlas fuera del origen de inscriptos.** Veníamos eligiendo entre dos campos malos del
  mismo origen, cuando el problema era el origen. Antes de dar por buena una fuente de fecha,
  conviene preguntarse si hay una tercera en otro lado.

  #### Y da la primera validación que no necesita un segundo origen

  Esto es lo más importante que salió del análisis de mails, y conviene decirlo aparte:

  > **Un evento fechado fuera del rango de su propio asunto está mal parseado. Punto. Sin
  > cruzarlo contra nada.**

  **Todo lo demás que armamos en esta migración compara A contra B**: el destino contra B2, el
  texto libre contra `fecha_fin`, el barrio del origen contra el del destino, `Para Revisar`
  contra el destino. Y toda comparación de dos fuentes tiene el mismo techo: **cuando difieren,
  no sabemos cuál está mal.** Por eso `DIAG_TOTAL_DIVERGENTE` mide 72 filas y no puede decir
  cuál de los dos números corregir; por eso el desacuerdo de ubicación va a `REVISAR_MATCH` y no
  a descarte.

  El rango del asunto es distinto en especie: **es una restricción interna al propio dato.** El
  mail dice de qué semana es y después lista sus eventos; si un evento cae fuera de esa semana,
  el error está adentro del mail y no hace falta una segunda opinión para verlo.

  Vale la pena buscar más validaciones de esta forma antes de agregar otra comparación de dos
  fuentes. Una restricción interna que se cumple sola es más barata de mantener y más fácil de
  creer que un cruce que hay que interpretar.

  > **Sube de prioridad: ahora bloquea el matching.** Con `figura + fecha` como clave única
  > (sección 1.a), la fecha es **la mitad de la identidad**. Un error de parseo deja de ser "un
  > campo mal cargado que se corrige después" y pasa a ser **un error de identidad**: la fila no
  > matchea con nada y no hay señal de confirmación que la rescate, porque el barrio tampoco
  > viene. Las **20 `fecha_mal_parseada`** no son 20 campos sucios, son 20 filas que el matching
  > no puede resolver. **Se arregla antes que el score**, no después.

  #### 🔴 Corrección: las 20 no eran errores de parseo. Es desfase por reprogramación

  Los casos que lista `diagCorteB()` tienen la misma forma: **el texto y `fecha_fin` coinciden
  entre sí, y el que difiere es el destino**, por 1 a 3 días.

  ```
  destino 01/08 | fecha_fin 29/07 | texto 29/07
  destino 23/09 | fecha_fin 22/09 | texto 22/09
  destino 10/04 | fecha_fin 08/04 | texto 08/04
  destino 31/03 | fecha_fin 30/03 | texto 30/03
  ```

  Es la regla de negocio de la sección 1.a: **la reunión se corre 2 o 3 días y el formulario
  queda con la fecha original.** Por eso la regla del mes resolvió **0 de 20** y
  `fecha_no_parseable` da 0: no había ningún mes mal. **El parseo no es el problema.**

  → **El arreglo es la escala del score, no el parser.** Hasta
  `TOLERANCIA_REPROGRAMACION_DIAS = 3` la fecha puntúa **como coincidencia plena**, igual que la
  exacta: dentro de esa tolerancia es la misma reunión. La escala anterior (±1 0,24 · ±3 0,15)
  castigaba justo la reprogramación y la tiraba debajo del umbral —figura + fecha ±3 daba 0,77.

  → **`fecha_mal_parseada` se renombró `desfase_reprogramacion`**, porque mentía. `diagCorteB()`
  ahora mide la lectura: cuántos casos tienen texto = `fecha_fin` y cuántos tienen el destino
  corrido 1-3 días.

  > **Ojo con lo que no explica.** La banda del grupo bajo daba ±1: 0, ±3: 8, **lejos: 50**. Que
  > ±1 dé 0 es esperable (±1 ya puntuaba 0,91, arriba del umbral), pero si el desfase típico es
  > de 1 a 3 días, **esas 50 no son reprogramación**. `logResumen_` ahora muestra el desvío real
  > día por día y separa tres poblaciones: había un formulario a ±3 con la figura reconocida,
  > había uno **sin ninguna figura reconocida** (probable: es el suyo y `figurasEnTexto_` no
  > encontró el nombre, así que uno lejano que sí la nombra le ganó el lugar), o no había nada.
  > Hasta ver ese reparto, las 50 no tienen explicación.
- **El barrio ya no viene en `B`.** Ni en el texto libre del evento ni como columna. **El origen
  pasó a mandar comuna.**

  Esto reinterpreta las **49 `barrio_no_reconocido`** de `DIAG_CORTE_B`: no son lista incompleta
  ni drift de escritura (`villa gral. mitre` vs `Villa General Mitre`). **El dato no está.**
  Ningún cambio en `detectBarrio_` las recupera: no hay nada que reconocer.

  > Queda sin objeto la idea de partirlas en `barrio_presente_no_reconocido` /
  > `barrio_ausente_en_origen`. Ya está contestado: **son todas ausentes.**

  Las dos consecuencias:

  1. **`detectBarrio_` deja de ser el camino.** Se suma `detectComuna_` a `02_Parsing.js`
     (`Comuna 6`, `C6`, `COMUNA 06` → `6`), y la comuna pasa a ser la señal de ubicación
     disponible. Confirma, no identifica (sección 1.b).
  2. **La ausencia de barrio no puede puntuar como contradicción.** Es el punto central del
     ajuste de la decisión 2: si "no vino el barrio" penalizara igual que "vino otro barrio",
     todas las filas nuevas caerían bajo el umbral y el pipeline fallaría justo en los casos que
     vinimos a arreglar.

  `diagScores()` mide **desde cuándo** dejó de venir, repartiendo por mes las filas de `B` con
  barrio detectable y sin él. Si el corte es reciente, explica la degradación mes a mes de la
  sección 3.2 — 6 casos en abril contra 20 en septiembre — y entonces **la causa es el cambio
  del formulario, no el código.**

- `detectPersona_` es una lista fija de 20 nombres. Nombre fuera de lista → `''` → la fila entra
  a B2 sin `Persona` y queda inindexable (3.1.f).
- `DEFAULT_YEAR = 2025` hardcodeado en `Código.js`.

### 3.4 `STATUS REUNIÓN` y `Asistentes`, leídos del código

Relevado antes de definir la excepción de la sección 0. **Sólo lectura, nada cambiado.**

#### Los cinco valores

Son los únicos que aparecen como literal en todo el repo
([Upset Base FInal.js:310-312](Upset%20Base%20FInal.js#L310)):

| valor | qué significa | ¿lo puede escribir el pipeline? |
|---|---|---|
| `en agenda` | agendada, todavía no pasó | es el **único origen** de la transición |
| `Realizada` | ocurrió | es el **único destino** de la transición |
| `Suspendida` | no se hizo | **no.** Decisión de una persona |
| `Reprogramada` | se movió de fecha | **no.** Decisión de una persona |
| `Se modifico el barrio` | cambió la ubicación | **no.** Decisión de una persona |

**Hay un solo valor que significa realizada** (`Realizada`), así que no hay ambigüedad de
sinónimos. Y **hay tres estados terminales distintos**, que es justo lo que había que confirmar:
por eso la whitelist de la sección 0 es de **un solo estado de origen** y no "cualquiera que no
sea `Realizada`".

`mapStatusToAllowed_` ([Upset Base FInal.js:318](Upset%20Base%20FInal.js#L318)) mapea variantes
—`cancelad*` → `Suspendida`, `programad*` → `en agenda`— y **cae a `en agenda` por defecto**.
Eso sería peligroso combinado con la transición: un estado desconocido se convertiría en
`en agenda` y de ahí a `Realizada`. **Hoy no pasa**: la única llamada está en `Control.js:159`,
que es un diagnóstico y no escribe. No incorporarla al camino de escritura.

#### La transición ya existe en el legado

[En agenda a Realizada.js:14-16](En%20agenda%20a%20Realizada.js#L14):

```js
const STATUS_FROM  = 'en agenda';
const STATUS_TO    = 'Realizada';
const MIN_ASISTENTES = 1;
```

Y la aplica sólo desde `en agenda` — la misma whitelist. **El criterio no hay que inventarlo,
hay que rescatarlo.** Lo que está mal es cómo escribe: ver 3.1.g.

#### De dónde viene `Asistentes`

**De A2, que sale de `RDV CONJUNTO`. No de B2.** Verificado en tres puntos:

- `B2` no tiene columna `Asistentes` en absoluto
  ([Sync B to B2.js:13-20](Sync%20B%20to%20B2.js#L13)): trae inscriptos, canales, sexo y edades;
- `A2` sí la tiene ([Sinc A to A2.js:14](Sinc%20A%20to%20A2.js#L14)), y se llena desde la solapa
  `Asistentes` de (2), que es IMPORTRANGE de `RDV CONJUNTO!A:L` de (1);
- en el upsert, `D.Asis` se escribe **únicamente** en el bloque de A2
  ([Upset Base FInal.js:104-105](Upset%20Base%20FInal.js#L104)); el bloque de B2 no lo toca.

Importa porque la transición se dispara con `Asistentes`: **el estado de una reunión depende de
la cadena de asistentes (A2), no de la de inscriptos (B2)**, que es la que está rota. Son dos
caminos independientes, y el que alimenta la transición es el que hoy funciona.

El flujo Agenda, además, evita pisarla a propósito
([Agenda push a base.js:387](Agenda%20push%20a%20base.js#L387)): `// NO tocar asistentes`.

### 3.5 La ventana de análisis: últimos 6 meses

**Todos los diagnósticos se calibran sólo sobre los últimos 6 meses.** En `00_Config.js` como
`VENTANA_ANALISIS_MESES = 6`.

**Por qué.** El formulario del origen cambió en **2025-10**: el barrio pasó de 0% ausente a 54%
(3.3.b). Calibrar umbrales contra datos anteriores es **ajustar el sistema a un origen que ya no
existe** — y en la dirección peligrosa, porque esos datos traían una señal que hoy no llega, así
que todo saldría más optimista de lo que es.

Qué cambia y qué no:

| | |
|---|---|
| **veredicto y calibración** | salen **sólo** de la ventana |
| **totales históricos** | se siguen reportando, aparte |
| **las solapas `DIAG_*`** | traen todas las filas, con una columna `en_ventana` para filtrar |
| **los repartos por mes** | van completos: son justamente para ver el cambio |

La ventana se mide sobre la fecha de la reunión, contra el día de hoy.

### 3.6 `syncManualCorrections_B2`: qué es ese 24,22% de error

Relevado por el activador que falla uno de cada cuatro disparos. **Sólo lectura.**

#### No depende de la mitad comentada

La pregunta concreta primero: **no.** `syncManualCorrections_B2` (línea 13, parte viva) **no
llama a nada de las líneas 266-547**, que están dentro de un comentario de bloque. Las dos
funciones que viven ahí —`exportMissingPersonaBarrio_B2_toManualSheet` e
`importManuals_fromManualSheet_toB2`— no las invoca nadie.

Los helpers que sí usa (`findIdxOr_`, `ensureHeaders_`, `str`, `strSafe`, `toDate_`) están
duplicados: una copia en la parte viva (líneas 213-253) y otra en la comentada. La comentada
está muerta, así que no compite.

> Detalle: el bloque comentado **no se puede revivir sacándole los `/* */`.** Vuelve a declarar
> `const MANUAL_SPREADSHEET_ID` y `MANUAL_SHEET_NAME`, que ya existen en las líneas 2-3 del
> mismo archivo. Descomentarlo es un `SyntaxError` inmediato.

#### Lo que sí encontré, y es peor

**a) Llama a `mapBarrioCanon_`, que no está en este archivo — y hay DOS en el proyecto.**

| dónde | qué hace |
|---|---|
| [Barrios.js:45](Barrios.js#L45) | lista `CANON` propia, con `'Villa Gral. Mitre'` y `'Monserrat'` |
| [Solapa agenda base final.js:208](Solapa%20agenda%20base%20final.js#L208) | delega en `canonBarrio_`, otra implementación |

**No devuelven lo mismo**, y cuál gana depende del orden de carga del proyecto, que no está en
el repo (3.1.c). Lo grave es dónde cae: `syncManualCorrections_B2` **escribe `BarrioN` en B2**,
que es la mitad de la clave natural. Y encima `Barrios.js` canoniza a `Villa Gral. Mitre`
mientras `detectBarrio_` de `Código.js` canoniza a `Villa General Mitre` — **las dos formas del
mismo barrio que 3.2 cuenta como variantes distintas.** Acá está una de las fábricas de ese
drift.

Los dos archivos que definen `mapBarrioCanon_` tienen activador, así que los dos están vivos.

**b) `deleteRow` invalida el índice en el medio del loop.**

Línea 76 arma `idToRowM`: ID → número de fila del sheet manual. Línea 97 lo consulta. Y línea
132, **dentro del mismo loop**, borra una fila:

```js
const existsM = idToRowM.get(id);      // línea 97
...
manSh.deleteRow(existsM);              // línea 132
```

Después del primer borrado, **todas las filas por debajo se corrieron una posición** y el mapa
quedó desactualizado. Las iteraciones siguientes escriben en la fila equivocada. No tira error:
**corrompe en silencio.**

El segundo bloque de borrados (líneas 197-200) sí está bien hecho —ordena descendente antes de
borrar— y la fase 2 vuelve a leer la hoja (`valsM2`, línea 146), así que el daño queda contenido
dentro de la fase 1.

#### Qué explica el 24,22%

No lo puedo afirmar sin ver el log de errores; los candidatos, por probabilidad:

1. **`findIdxOr_` sin `optional`** en `id`, `nombre`, `persona`, `fecha` (líneas 21-24): si
   falta cualquiera de esas columnas en B2, **tira**. Y cuál `findIdxOr_` corre depende del
   orden de carga — hay seis copias.
2. **`mapBarrioCanon_` resuelto a la versión de `Solapa agenda base final.js`**, que llama a
   `canonBarrio_`: si esa cadena se rompe, es `TypeError`.
3. Que B2 esté a medio escribir cuando arranca, porque el pipeline principal no corre (3.1.a).

**Es el mismo patrón de 3.1.c en todos los casos: el proyecto depende de un orden de carga que
no está versionado.** Un 24% de fallas intermitentes es exactamente la forma que toma eso.

---

## 4. Arquitectura destino

**Hoy** (dos saltos, staging en el medio, el paso 5 bidireccional):

```
Hoja1 (1W7mzk) ──IMPORTRANGE──► B ──► B2 ──┐
                                           ├─paso 4──► Para Revisar ──paso 5──► RVD JM-CM - ES
RDV CONJUNTO (1ZpHO6) ─IMPORTRANGE─► A ──► A2 ┘            ▲                          │
                                                           └──────────────────────────┘
                                                        (sólo valores no numéricos)

Gmail ──► Agenda (1hP8zMN8) ──► Para Revisar
```

**Destino** (un salto, sin staging, una sola dirección):

```
Hoja1 (1W7mzk) ──openById──► B2 ──┐
                                  │
RDV CONJUNTO (1ZpHO6) ─openById─► A2 ──┼──► upsert único ──► RVD JM-CM - ES ──► recalcDerivadas_()
                                  │       (setSiDelSistema_)        │
Gmail ──► Agenda (1hP8zMN8) ───────┘                                 └──► SIN_MATCH

Para Revisar (legado)   [archivo, sólo lectura, no lo escribe nadie]
```

### Decisiones

1. **Leer por ID, no por IMPORTRANGE.** `SpreadsheetApp.openById()` sólo necesita permiso de
   lectura, que ya tenemos. Elimina la carrera de recálculo. `B` y `Asistentes` quedan como
   vista para el equipo; el script deja de depender de ellas.
2. **`RDV_UID`**: uuid generado en B2/A2 al insertar, inmutable. En el destino va como columna
   nueva al final (`AP`). El upsert busca por `RDV_UID`; si está vacío cae a `figura + fecha` y
   **estampa el uuid**. Después de una corrida casi todo entra por uuid.

   > **No es una mejora ni la mejor opción: es la ÚNICA.**
   >
   > Cuando esto se escribió, la clave natural todavía parecía un plan B razonable. **Ya no lo
   > es**: no hay clave natural (3.2). Los tres campos que la formaban están rotos o ausentes y
   > ninguno va a volver. No queda alternativa que evaluar.
   >
   > Mientras la clave dependa de campos que manda el origen, **cada cambio del formulario
   > rompe el matching de nuevo**. No es hipotético: **ya pasó, con el barrio.** El origen dejó
   > de mandarlo, y de golpe 49 filas quedaron sin poder identificarse — sin que nadie tocara
   > una línea de código de este lado (3.3.b).
   >
   > La clave natural es un **puente para la primera corrida**, no el destino. Todo lo demás de
   > esta decisión —el score, los umbrales, `detectComuna_`— existe para poder estampar uuids en
   > las filas que hoy no los tienen. Una vez estampados, el origen puede cambiar lo que quiera.
   >
   > Corolario para la Fase 4: **estampar uuids es urgente**, y cuanto antes se corra, menos
   > filas quedan expuestas al próximo cambio de formulario.

   #### Cuando la clave natural tampoco alcanza: match por score

   Los nombres de evento del origen **no los controlamos** (regla dura, sección 1). Son texto
   libre, y a veces una sola inscripción menciona a varios funcionarios. Un match exacto o nada
   deja afuera casos perfectamente resolubles, así que el tercer nivel es un **score**.

   **Nivel 2 es `figura + fecha`.** Por la regla de negocio de la sección 1.a —una figura no
   tiene más de una reunión por día— esos dos campos alcanzan como clave. **La ubicación no
   entra en la identidad: confirma.**

   #### El score se normaliza sobre las señales disponibles

   El score que decide es **`obtenido / alcanzable`**, donde `alcanzable` es la suma de los
   pesos de las señales que **se pudieron evaluar** en esa fila.

   Los pesos suman 1.0 sólo con las cuatro señales presentes, pero **el barrio ya no viene nunca
   y la hora casi nunca**, así que 1.0 es inalcanzable por construcción para el caso normal. Una
   fila con figura, fecha exacta y comuna coincidente **acertó todo lo que había para acertar** y
   tiene que puntuar 1.00, no 0.80 por campos que el origen no manda.

   Bajar el umbral tapaba el síntoma. Normalizar arregla la causa, y de paso el umbral pasa a
   significar algo estable: **qué proporción de la evidencia disponible coincide**. Deja de
   necesitar recalibración cada vez que cambia el formulario — que es exactamente lo que ya nos
   pasó con el barrio.

   El score absoluto y el alcanzable se reportan igual en `DIAG_SCORES`: no deciden nada, pero
   muestran **qué señales se están perdiendo**.

   Cada candidato de `B` recibe un puntaje sobre **1.0**:

   | señal | puntaje |
   |---|---|
   | figura mencionada en el texto del evento | **0,35** |
   | fecha exacta **o a ±3 días** (`TOLERANCIA_REPROGRAMACION_DIAS`) | **0,30** |
   | fecha ±7 días | 0,06 |

   > Hasta el 25/09 la escala era exacta 0,30 · ±1 0,24 · ±3 0,15. Castigaba la
   > reprogramación, que es de 1 a 3 días (3.3.c, *"Las 20 no eran errores de parseo"*).
   | barrio coincide | **0,25** |
   | comuna coincide, **con barrio ausente en el origen** | 0,15 |
   | hora coincide | **0,10** |

   #### La fecha es señal, no clave — y ninguna banda descarta

   Cambió con el cierre de 3.3.c. Antes la fecha era mitad de la clave; ahora es una señal más,
   con **escala decreciente y ningún efecto eliminatorio**: un desvío de 30 días puntúa 0 y el
   candidato **sigue compitiendo** con las demás señales.

   El escalón de ±7 no es arbitrario: de los 223 comparables de `diagFechaFin()`, **sólo 4**
   tienen |d| > 7. Darle 0,06 reconoce que "la misma semana" aporta algo sin que alcance para
   decidir nada solo.

   Y `distanciaFecha_` mide contra **la fecha del texto**, ya validada por la regla del mes
   (1.c). `fecha_fin` entra **sólo como respaldo**, cuando el texto no dio ninguna ocurrencia
   aceptable. No se compara contra las dos quedándose con la más cercana: `fecha_fin` es el
   cierre del formulario, no la reunión, y coincidir con él no es evidencia (3.3.c, corrección).

   #### Dos puertas de relevancia, con anchos distintos

   | puerta | para qué | condición |
   |---|---|---|
   | `relevante` | el **match automático** | comparte figura, **o** fecha dentro de ±7 |
   | `proponible` | `EMPAREJAR_MANUAL`, que mira una persona | comparte figura, **o** fecha dentro de ±21 |

   Vale ofrecerle un par dudoso a alguien para que lo confirme; no vale escribirlo solo. Sin
   esta separación, cualquier formulario a tres semanas de distancia entraba como "mejor
   candidato descartado" y ensuciaba `SIN_MATCH` con nombres que no tienen nada que ver — el
   tipo de ruido que hace que después nadie mire el reporte.

   **La ubicación no abre ninguna de las dos puertas.** Confirma, no identifica (sección 1.b).

   #### La ubicación tiene tres estados, no dos — y cuatro vías de evaluarse

   | situación en el origen | efecto |
   |---|---|
   | barrio presente y **igual** | **+0,25** |
   | barrio **ausente**, comuna presente y coincide | **+0,15** |
   | sin barrio ni comuna, **eje** del formulario = eje del barrio del destino | **+0,10** (detrás de `EJE_COMO_UBICACION`, ver 1.d) |
   | ~~sin barrio, comuna ni eje, **`EVENTO` del destino en el nombre del formulario**~~ | ~~+0,25~~ **descartado**: `EVENTO` es una categoría (718/802), flag en `false` |
   | barrio, comuna **o eje** presentes y **distintos** | **descalifica** el candidato |
   | ni barrio, ni comuna, ni eje, ni evento | **no puntúa ni cuenta para el denominador** |

   #### `EVENTO`: la ubicación de las reuniones temáticas — **DESCARTADO por medición**

   > **Lo que sigue es el diseño original, y no se sostuvo.** `EVENTO` coincide por subcadena con
   > 718 de 802 filas: es una categoría (`Encuentro con Vecinos`), no un identificador.
   > `EVENTO_COMO_UBICACION` queda en `false` y **se sacó de la puerta de `EMPAREJAR_MANUAL`**,
   > donde había subido la densidad de 2,6 a 8,2 pares por fila. La puerta vuelve a
   > `figura Y (fecha ±21 O comuna)`, más el eje cuando se confirme. Ver 1.d.

   Las reuniones temáticas (sección 1.d) no tienen lugar, tienen **tema**, y el tema está en la
   columna `EVENTO` del destino y repetido en el nombre del formulario. Eso alcanza para
   confirmar un candidato.

   **Vale lo mismo que el barrio (0,25) y ocupa su lugar en el denominador**, no se suma aparte.
   Una fila temática con **figura + fecha + evento tiene evidencia completa**, no parcial — que
   es exactamente el principio de la normalización: se puntúa sobre lo que había para acertar.

   > **Tiene la propiedad que veníamos buscando: se compara, no se interpreta.**
   >
   > Sin listas fijas, sin canonización, sin parser. Es el mismo precedente que la **clave del
   > flujo Agenda** (`persona|fecha|hora`), que sigue siendo la mejor del proyecto justamente
   > porque no depende de que una lista reconozca un texto libre
   > ([docs/agenda-legado.md](docs/agenda-legado.md)). Todo lo que sí depende de eso —
   > `detectPersona_` con sus 20 nombres, `detectBarrio_`, los dos `mapBarrioCanon_` con alias
   > cruzados (3.1.h)— es de donde salieron los bloqueantes.

   **Positivo únicamente: entra al denominador sólo cuando coincide.** Es asimétrico respecto
   del barrio y es deliberado. Un barrio distinto **afirma** que la reunión fue en otro lado, y
   por eso descalifica; un evento que no coincide no afirma nada, porque el nombre del
   formulario es texto libre y puede simplemente no repetir el tema. Penalizarlo sería castigar
   a una fila por cómo la tipeó alguien.

   **Arranca apagado** (`EVENTO_COMO_UBICACION = false`). No es cautela de trámite: el bloque
   **2d** del log mide la cobertura —cuántas filas traen `EVENTO`, en cuántas coincide, cuántas
   del grupo bajo y de los huérfanos la tienen— **antes** de que la señal puntúe nada. Es la
   regla de §6 aplicada a nuestro propio diseño: las tres falsas alarmas de esta migración
   fueron números altos presentados como conclusiones.

   ~~Lo que **no** está detrás del flag: la medición, y la tercera vía de relevancia de
   `EMPAREJAR_MANUAL`.~~ La vía de relevancia se sacó (ver el recuadro de arriba); queda sólo la
   medición del bloque 2d.

   > **Y la aritmética, anotada antes de que el número invite a una conclusión que no da.**
   > Como el evento sube el numerador **y** el denominador, casi no mueve el veredicto
   > automático: `figura + fecha exacta + evento` da 1,00, que ya daba 1,00 sin el evento, y
   > `figura + fecha ±7 + evento` da **0,73**, que sigue debajo de 0,88. Donde sí cambia algo es
   > en el **margen** entre dos candidatos y en la **puerta de `EMPAREJAR_MANUAL`**. Si el
   > déficit dominante de una fila es la fecha, el arreglo es 3.3.c y no esta señal.

   **La distinción no es barrio contra comuna: es ausencia contra desacuerdo.**

   - **Ausencia no puntúa** — y tampoco resta, porque ni siquiera entra al denominador de la
     normalización. Si "no vino el barrio" restara lo mismo que "vino otro barrio", todas las
     filas nuevas caerían bajo el umbral —porque el origen dejó de mandar barrio (3.3.b)— y el
     pipeline fallaría exactamente en los casos que vinimos a arreglar.
   - **Desacuerdo descalifica**, venga del barrio o de la comuna. No hay grados entre "esta es
     la reunión" y "esta es otra reunión". Un candidato descalificado **nunca le gana a uno sin
     desacuerdo**, por más score que tenga.

   #### Pero el desacuerdo va a `REVISAR_MATCH`, no a `SIN_MATCH`

   Con una salvedad que cambia el destino del caso: **la comuna del destino se deriva del
   barrio, y el barrio lo carga una persona** (sección 1.b, decisión 8). Si esa persona se
   equivocó de barrio, el desacuerdo es un dato malo **del destino**, no del origen — y
   descartar sería castigar al origen por un error nuestro.

   Así que un candidato descalificado por ubicación, **cuando el resto de las señales da alto**,
   va a `REVISAR_MATCH` con motivo `ubicacion_en_desacuerdo`. Hay un candidato razonable y una
   contradicción en un solo campo: es literalmente el caso para el que existe la revisión.

   `SIN_MATCH` queda para lo que de verdad no tiene match: ningún candidato, o ninguno lo
   bastante bueno.

   > **Cae la medición de colisiones dentro de la comuna** que estaba pedida antes. Con la regla
   > de la sección 1.a no puede haber dos reuniones de la misma figura el mismo día, así que no
   > hay empate posible que la comuna tenga que desempatar.

   **Decide el umbral más el margen contra el segundo candidato, no la unicidad.** Que haya un
   solo candidato no lo vuelve correcto, y que haya varios no vuelve al mejor incorrecto:

   | condición | qué pasa |
   |---|---|
   | score ≥ `UMBRAL_MATCH` **y** margen ≥ `MARGEN_MINIMO` | escribe y **estampa el `RDV_UID`** |
   | score ≥ `UMBRAL_MATCH` pero margen chico | va a **`REVISAR_MATCH`**, no se escribe |
   | score < `UMBRAL_MATCH` | va a **`SIN_MATCH`** |

   ```js
   // 00_Config.js — PROVISORIOS, a calibrar
   const UMBRAL_MATCH  = 0.75;
   const MARGEN_MINIMO = 0.15;
   ```

   **Los dos números son provisorios y están puestos a ojo.** Se calibran corriendo en seco
   contra las filas de `DIAG_CORTE_B` **que caen dentro de la ventana de análisis** (3.5) —no
   contra las 103 históricas— y mirando la distribución real de scores:
   `diagScores()` (en `diagnostico/02_corte_B_a_B2.js`) la vuelca sin escribir nada. Hasta que
   esa distribución exista, cualquier umbral es inventado.

   #### Barrio contra barrio, comuna contra comuna

   **Nunca se compara un barrio contra una comuna.** Para el parcial de 0,15: la comuna del
   origen sale de `detectComuna_` sobre el texto libre, y la del destino de **subir su barrio**
   por la tabla `Comunas`. Se comparan **dos comunas**. Si el barrio del destino no está en la
   tabla, la señal no suma: no se inventa la comuna ni se compara texto crudo.

   Ojo con el sentido: se sube de barrio a comuna, nunca al revés. **De la comuna no se deduce
   el barrio** — cada comuna tiene entre 2 y 6 (sección 1.b).

   #### `multi_figura` no es ambigüedad

   Si el texto del evento menciona **dos o más figuras conocidas**, el caso no es "no sé cuál
   es": es **una inscripción compartida por varias reuniones**. Se marca `multi_figura` y se
   lista en `REVISAR_MATCH` con **todos** los candidatos, no sólo el mejor.

   > **Abierto, decisión de negocio:** cómo se reparten los inscriptos de una inscripción
   > compartida entre las reuniones que la comparten. ¿Se duplica el total en cada una? ¿Se
   > divide? ¿Se asigna a una sola? **No lo resuelve el pipeline por su cuenta.** Hasta que haya
   > una respuesta, estos casos quedan en `REVISAR_MATCH` sin escribir nada.

   #### Trazabilidad: qué formulario se pasó

   Columnas nuevas al final del destino, junto a `RDV_UID`:

   ```
   RDV_UID | form_origen | form_score | form_nivel | form_fecha_match
   ```

   - `form_origen` es el `Nombre` del evento de `B`, **literal, sin normalizar**. Es
     trazabilidad, no una clave: se guarda tal cual vino;
   - `form_nivel` dice **por qué señales** matcheó (`figura+fecha±1+comuna`);
   - **se escriben también cuando el score NO alcanzó.** Ahí `form_origen` guarda el mejor
     candidato descartado y `form_nivel` el motivo.

   Esa última línea es la que importa. Un caso mal resuelto tiene que poder auditarse **sin
   volver a correr nada** — y el día que aparezca una fuente de fecha mejor, con `form_origen`
   guardado se puede reprocesar y **comparar contra lo que se había decidido**, en vez de
   empezar de cero.

   #### `REVISAR_MATCH` deja de ser cola de trabajo

   Pasa a ser **un reporte**: filas donde hubo candidato pero no alcanzó. Se mira cuando se
   quiera, no bloquea nada. Confirmar una estampa el `RDV_UID` y el caso no vuelve a aparecer.

   El cambio es de expectativa más que de formato: **no hay bootstrap manual previo.** Nadie
   resuelve 103 filas antes de arrancar. El pipeline hace lo que puede en cada corrida y deja
   registrado lo que no.

   #### `EMPAREJAR_MANUAL`: el lado que falta

   Todo lo demás mira **desde el destino hacia `B`**. Falta el opuesto: **formularios que no se
   asociaron a ninguna fila**. Con las dos listas juntas el problema se ve completo, y muchas
   veces la solución salta a la vista — un formulario huérfano y una fila vacía que
   evidentemente se corresponden.

   ```
   nombre_formulario | inscriptos | Figura | Barrio | Fecha | score | senales | confirmar
   ```

   - **sólo pares con alguna razón de serlo.** 103 contra 100 sin filtrar son 10.300 filas y
     nadie las mira. El piso es bajo (`PISO_EMPAREJAR`) pero existe;
   - **ordenado por score descendente**, no por fecha: lo más plausible arriba, que es como se
     trabaja una lista así;
   - los candidatos de un mismo formulario van **juntos y seguidos**, para poder elegir entre
     ellos sin buscarlos. Los grupos se ordenan por su mejor candidato;
   - `confirmar` vacía. Cuando el pipeline la encuentra llena, **estampa el `RDV_UID` en las dos
     puntas** y esa fila no vuelve a aparecer.

   **Dos bloques al final: formularios sin ningún candidato, y filas del destino sin ninguno.**
   Son la medida de lo que el sistema **no puede resolver ni con ayuda humana**. Si ese bloque
   es grande, falta información que no está en ninguno de los dos lados — y eso es una
   conversación con quien carga los formularios, no un problema de código.

   **Exclusiones:** formularios marcados `NO USAR` (el origen ya los descartó; reintroducirlos
   sería deshacer una decisión ajena) y filas cuya reunión **todavía no pasó** — no son hueco,
   son futuro.
3. **Clave B→B2 sin métricas**: `normalizeText_(Nombre) + "|" + yyyyMMdd(fecha_fin)`.
   Hoy usa `nombre|inscriptos`. Los inscriptos son finales (el formulario cierra), así que en
   la práctica funciona, pero una métrica no puede formar parte de una clave.
4. **Un solo `toDate_`, un solo `normalizeText_`, un solo `normalizeHeader_`**, en `01_Utils.js`.
   `toDate_` con formato día-primero explícito, nunca `new Date(string)`. Borrar las otras copias.
5. **`SIN_MATCH` visible**: lo que hoy es `skippedB++` pasa a ser una fila con origen, clave
   calculada y motivo.
6. **Sacar `Procesado BF` como flag permanente.** Con clave estable el upsert es idempotente:
   reprocesar escribe el mismo valor en la misma fila. Si preocupa el tiempo de ejecución,
   filtrar por ventana de fecha, no por flag.
7. **Reescribir la columna `Z (ID)`** con formato consistente `Figura - Barrio - dd/MM/yyyy`.
8. **Columnas manuales protegidas.** `00_Config.js` lleva la lista explícita de columnas que el
   equipo carga a mano. **Confirmadas, son seis:**

   ```js
   const COLUMNAS_MANUALES = [
     'Barrio', 'Inscriptos', 'Mail', 'Call Center', 'IVR', 'RRSS', 'Difusión'
   ];
   ```

   **`Barrio` entró a la lista** cuando el origen dejó de mandarlo (3.3.b): hoy lo carga una
   persona, así que es de ellos. Con una consecuencia que conviene tener presente: la columna
   `AA (Comuna)` deriva del barrio por fórmula, así que **la comuna del destino también pasó a
   depender de carga manual** — y es la que usa el match por score como señal de confirmación.

   El pipeline **las lee y nunca las escribe, ni aunque estén vacías.** No es "no pisar": es no
   escribir. Una celda vacía en una columna manual significa que todavía nadie la cargó, y ese
   hueco es información — si el script lo rellena con un cero, el equipo pierde la señal de que
   falta cargarlo.

   Esto es más fuerte que el invariante de la sección 0: `setSiDelSistema_` permitiría escribir
   sobre una celda vacía, y acá ni eso. Las dos reglas conviven — la lista se chequea primero.

   Ojo con `Inscriptos`: es el total que ve la gente y lo escribe una persona, pero el
   desagregado de sexo y edades lo calcula el sistema a partir del `Inscriptos` de B2, que es
   otro número. `DIAG_TOTAL_DIVERGENTE` (Fase 1) mide en cuántas filas no coinciden.

9. **Las once columnas derivadas, bloqueadas por nombre desde `00_Config.js`.**

   ```js
   const COLUMNAS_DERIVADAS = [
     'Día de la semana', '% de Asistencia', 'Direccion2', 'Falta Informacion',
     'Comuna', 'Poblacion', 'p. Mujer', 'P. Varon', '(km2)', '(hab/km2)', 'Zona'
   ];
   ```

   **Nada de `getFormula()` dinámico.** El paso 5 lo usa como guard ([línea 266](Sinc%20Base%20usuario.js#L266))
   y no protege nada: en un bloque expandido por una fórmula de array, la fórmula vive **sólo en
   la celda ancla** — acá, el encabezado de la fila 1. `getFormula()` sobre `X500` devuelve
   cadena vacía, el guard no dispara, el `setValue` entra y rompe el array entero.

   La lista del paso 5 tiene **diez** nombres para once columnas: le falta `Direccion2` (`X`),
   que es justo la que el `getFormula()` tampoco cubre. Es un `#REF!` esperando su turno, si
   `Para Revisar` tiene una columna que normalice a `direccion2` — hay que mirarlo en la
   planilla. Detalle en [docs/sync-bidireccional.md](docs/sync-bidireccional.md).

   Una lista explícita de once nombres es aburrida, verificable de un vistazo y no depende de
   que la API devuelva lo que uno cree. Es todo lo que se necesita.

   **Esto es un puente, no una solución.** La Fase 3 convierte las once columnas en valores
   escritos por el script, y con eso **desaparece la clase entera de problema**: sin fórmulas de
   array no hay bloque que romper, no hay celda ancla, no hay límite en la fila 2374 y la lista
   pasa a ser sólo "columnas que calcula `recalcDerivadas_()`". Por eso **la Fase 3 es
   prerrequisito duro de la Fase 9**: sacar el staging con las fórmulas todavía puestas es
   poner un upsert nuevo a escribir contra once bombas.

10. **Se elimina el staging.** B2, A2 y el flujo Agenda escriben **directo al destino** a través
   de un único upsert. Con eso:

   - desaparece `Sinc Base usuario.js` entero (433 líneas) y con él la bidireccionalidad, que
     el invariante de la sección 0 prohíbe;
   - queda **una sola clave en juego** en vez de dos (`B2 → Para Revisar` y
     `Para Revisar → destino` hoy calculan la misma clave natural dos veces, con dos copias
     distintas de `toDate_`);
   - el flujo Agenda se redirige al upsert nuevo. El staging es su única dependencia real:
     `agenda_pushReadyToBaseFinal` escribe en `Para Revisar` y nada más.

   `Para Revisar` se renombra **`Para Revisar (legado)`** y queda como archivo de sólo lectura.

   **Confirmada por el diagnóstico del 2026-09-22 (sección 3.2).** La duda era si `Para Revisar`
   guardaba filas que nunca cruzaron al destino: en ese caso habría sido la fuente del backfill
   y no un residuo. **No las guarda.** Tiene 802 claves, las mismas 802 del destino, cero
   duplicadas: es un espejo. Y los pasos 4 y 5 dieron cero cortes, así que tampoco pierde nada.
   La decisión no hay que reabrirla.

   Lo que sí cambió es la **urgencia**: sacar el staging es simplificación, no cura. El hueco no
   está acá. Ver Fase 9.

   Lo que **no** cambió es el **orden**: Fase 3 → `setSiDelSistema_` (Fase 2) → Fase 8 → Fase 9. Que ya
   no sea urgente no lo vuelve barato.

11. **Avisar, no corregir: `verificarCambiosRecientes_()` en `40_Alertas.js`.**

    Corre **al final del pipeline**. Toma las filas del destino cuya **fecha de reunión** cae
    dentro de los últimos `VENTANA_ALERTA_DIAS` días y compara `Inscriptos`, sexo, edades y los
    cinco canales contra lo que trae B2. Si difieren, escribe una línea en `ALERTA_CAMBIOS`
    (en la intermedia):

    ```
    clave | columna | valor_destino | valor_origen | diferencia | fecha_deteccion
    ```

    **Sólo lectura sobre el destino: no corrige, no escribe, no repinta.** Los números del
    sistema son cerrados (sección 0). Si uno que ya estaba cargado aparece distinto en el
    origen, lo más probable **no** es que el origen tenga la versión buena — es que el origen se
    equivocó. Escribirlo encima **propagaría el error en vez de detectarlo**, y de paso pisaría
    carga del equipo. La alerta existe para que lo mire una persona.

    Es lo que queda en lugar del `onEdit` descartado: aquel escribía formato para habilitar
    escrituras que no hacen falta; este no escribe nada y avisa de lo único que sí importa.

    ```js
    // 00_Config.js
    const VENTANA_ALERTA_DIAS = 15;
    ```

    **La ventana se mide sobre la fecha de la reunión, no sobre cuándo se cargó la fila**,
    porque **no hay ninguna columna con timestamp de carga** ni en el destino ni en B2. Es una
    aproximación conocida: una fila vieja que alguien completa hoy queda fuera de la ventana.
    El día que exista una columna de timestamp, esto debería medirse sobre ella.

    `ALERTA_CAMBIOS` es un log: se acumula, no se limpia, y las alertas repetidas no se vuelven
    a escribir (dedupe por clave + columna + par de valores) para que correr el pipeline todos
    los días no la llene de la misma línea.

    Un detalle que va a cambiar: hoy se saltea el caso "B2 trae 0", porque `num()` convierte
    vacío en cero en todo el legado y los dos casos son indistinguibles (sección 0.a). Cuando la
    Fase 2 haga que vacío se propague como vacío, un 0 real pasa a alertar. Está marcado en el
    código.

12. **`marcarRealizada_`: la transición de estado, como excepción anunciada.**

    El detalle está en la sección 0 y los valores relevados en 3.4. Lo que hay que retener acá:

    - **está afuera de `setSiDelSistema_`**, en `05_Escritura.js`, para que la regla general
      siga siendo cierta y verificable con un grep;
    - **whitelist de un solo estado de origen** (`en agenda`), no "cualquiera que no sea
      `Realizada`". Esa diferencia es lo que impide pisar una reunión suspendida a mano;
    - se dispara con `Asistentes`, que viene de **A2 / `RDV CONJUNTO`**, no de B2 (3.4);
    - pinta `#4F81BD` como cualquier escritura del sistema.

    Y lo que reemplaza: `marcarRevisadaEnOrden()` (3.1.g), que decide lo mismo pero reescribe la
    planilla entera y la ordena.

### Estructura de archivos

```
00_Config.js       IDs, solapas, COLUMNAS_MANUALES, COLUMNAS_DERIVADAS, VENTANA_ALERTA_DIAS.
                   Único lugar con literales.                                   ← ya escrito
01_Utils.js        toDate_, normalizeText_, normalizeHeader_, findIdxOr_, str, num   ← ya escrito
02_Parsing.js      detectPersona_/Barrio_/Comuna_/Fecha_, listas derivadas de datos ← ya escrito
05_Escritura.js    setSiDelSistema_ + marcarRealizada_. El único que escribe en el destino.  ← ya escrito
10_LeerOrigenes.js openById → A2 y B2, con RDV_UID
20_UpsertDestino.js  B+A2 → destino, match uuid→score, 3 reportes   ← ya escrito (DRY_RUN)
30_Derivadas.js    recalcDerivadas_() — las 11 columnas que hoy son fórmulas
40_Agenda.js       flujo Gmail → Agenda → upsert  (rescatado del legado, redirigido)
40_Alertas.js      verificarCambiosRecientes_() → ALERTA_CAMBIOS                ← ya escrito
99_Correr.js       índice de lo que se corre a mano, en orden. Sin lógica propia    ← ya escrito
99_Pipeline.js     orquestador + onOpen() con menú
diagnostico/       reportes de sólo lectura de las Fases 1 y 1b                 ← ya escrito
_archivo/          código muerto, fuera del scope global
```

`00_Config.js` y `40_Alertas.js` **ya están en el repo**, adelantados al resto: la alerta es de
sólo lectura sobre el destino, no depende de nada de la Fase 2 y no rompe nada al convivir con
el legado. **Todavía no están enganchados al pipeline** — `verificarCambiosRecientes_()` se
llama desde `99_Pipeline.js` cuando ese archivo exista, o a mano con `correrAlertaCambios()`.
Sus helpers `_alerta` son provisorios y los reemplaza `01_Utils.js` en la Fase 2.

`05_Escritura.js` está separado a propósito. Que las escrituras vivan sólo ahí hace que la regla
de la sección 0 sea verificable de un vistazo: si `grep -rn "setValue\|setBackground" .` devuelve
algo fuera de ahí que apunte al destino, está mal. Tiene dos funciones y la segunda,
`marcarRealizada_`, es la única excepción — anunciada, no escondida adentro del helper.

### Qué se archiva

100% comentados: `Back up Agenda traer datos del mail.js`, `Completo Actualizacion sola.js`.
Diagnósticos de una época: `Comparacion.js`, `Test Puntual.js`, `Test claves.js`, `Control.js`,
`Backfill.js`. Forks del mismo upsert: `Con Barrio Sinc A to A2.js`,
`Upset Base FInal solo actualizacion.js`. Sueltos: `Sin título 3.js`,
`En agenda a Realizada.js`.

### Lo que NO se archiva: tienen activador

> **Corrección.** Tres archivos estaban en la lista de arriba y **hay que sacarlos**:
>
> | archivo | función | por qué estaba mal |
> |---|---|---|
> | `Solapa agenda base final.js` | `syncAgendaSheetInBaseFromAgenda_2` | **tiene activador activo** |
> | `Barrio desde Base.js` | `syncBarriosFromBaseToAjusteRDV` | **tiene activador activo** |
> | `Carga Manual persona o barrio por equipo/.js` | `syncManualCorrections_B2` | **tiene activador activo** |
>
> Estaban marcados para archivar porque **ninguna función del proyecto los llama**. Y es cierto:
> no los llama el código. **Los llama un activador.**

**La regla, para que no vuelva a pasar:**

> **"No lo llama nadie en el código" no significa huérfano mientras no se coteje contra los
> activadores.**

En este proyecto hay **dos** grafos de llamadas y sólo uno está en el repo. El otro vive en la
UI del editor, no se ve en un `grep`, no aparece en un diff y no está en `appsscript.json`.
Archivar por análisis estático es apagar procesos en producción sin saberlo.

Por eso `docs/triggers-legado.md` es **prerrequisito de la Fase 2**, no un trámite de la Fase 0:
sin ese inventario, cualquier decisión de archivado es una apuesta.

Qué hacer con los tres: se mantienen vivos hasta que su función esté cubierta por la
arquitectura nueva, y recién ahí se da de baja el activador **antes** de archivar el archivo.

**Se elimina, no se archiva:** `Sinc Base usuario.js`. Es el paso 5 y con la decisión 10 deja de
tener razón de existir: sincroniza dos hojas cuando va a quedar una sola, y lo hace en las dos
direcciones, que el invariante prohíbe. Queda en git y, leído, en
[docs/sync-bidireccional.md](docs/sync-bidireccional.md) — lo único que hay que llevarse de ahí
es la regla de `#4F81BD`, que ya está en la sección 0. **Se borra en la Fase 9, no antes.**

Se rescata y reescribe: los tres `detect*_` de `Código.js`, la canonización de `Barrios.js`,
los cinco pasos de `Completo.js`, y el bloque Agenda completo (redirigido al upsert nuevo:
hoy escribe en `Para Revisar` y va a escribir en el destino).

---

## 5. Plan de migración

### Fase 0 — Red de contención
- Rama `migracion`. `main` queda intacto como referencia.
- Copia completa de (1) y (2) en Drive, fechada. **Antes de tocar una sola fórmula.**
- Inventario de los activadores actuales (editor → Activadores): función, tipo, frecuencia,
  dueño. Anotar en `docs/triggers-legado.md`. Todavía no dar de baja nada.
- Anotar la **tasa de error** de cada activador (editor → Ejecuciones). Es lo que separa un
  activador que funciona de uno que viene fallando hace meses sin que nadie lo note.

### Fase 1 — Diagnóstico del hueco
`diagnostico/01_hueco_sexo_edades.js`, sólo lectura, cinco solapas de salida en la planilla
intermedia (2). **No escribe ni un valor ni un fondo en el destino.**

- `DIAG_HUECO` — las filas sin sexo/edades contra los **dos saltos**: ¿existe en B2? ¿existe en
  `Para Revisar`? ¿dónde se cortó, en `B2 → PR` o en `PR → destino`? ¿está marcada
  `Procesado BF = TRUE`?
- `DIAG_PISADO` — qué valor de canales traería B2 contra lo que hay hoy en el destino.
- `DIAG_ATOMICIDAD` — `Inscriptos` y canales los carga el usuario y tienen que entrar juntos.
  Mide las filas donde entraron a medias.
- `DIAG_TOTAL_DIVERGENTE` — el total que ve la gente lo escribe el usuario; el desagregado lo
  calcula el sistema sobre el total de B2. Cuenta en cuántas filas no son el mismo número.
- `DIAG_PROCEDENCIA` — cuántas celdas de las seis `COLUMNAS_MANUALES` tienen fondo `#4F81BD`.
  Es la medida directa de cuánto pisó el legado la carga del equipo.

Cada reporte es un entry point ejecutable suelto y lee sólo las solapas que necesita: la primera
corrida murió con `Service Spreadsheets timed out` en el último y se llevó puesto todo lo previo.

**Corrió el 2026-09-22. Resultado en la sección 3.2: el corte está en `B → B2`.** Los pasos 4 y
5 no pierden nada, así que el backfill no es un reproceso del staging — hay que ir a `B` y, si
hace falta, al origen.

### Fase 1b — Dónde se corta `B → B2`  *(en curso)*

`diagnostico/02_corte_B_a_B2.js`, sólo lectura. Busca cada reunión en el import crudo `B` y
clasifica por qué `syncB_to_B2` no generó fila: la persona o el barrio fuera de las listas fijas,
la fecha no parseable o mal parseada, la fila que ya no está en `B`, o la que debería haber
entrado y no entró.

**La población son todas las filas del destino sin contraparte en B2**, no sólo las 72 del hueco.
El recorte por el hueco era operativo y traía un sesgo que apuntaba contra lo que hay que medir:
**las filas viejas ya tienen sexo y edades cargados a mano, así que nunca entran al hueco**, y es
justo ahí donde se manifestaría una ventana móvil del import. Medir sólo el hueco habría dado
`desaparecida_del_origen = 0` por construcción. La columna `origen_fila` separa `hueco` de
`sin_contraparte_B2` y el reporte da el reparto de causa en cada población y en el total.

Suma `DIAG_DUP_B2` con las 14 claves duplicadas. Detalle en
[docs/prompts/PROMPT-02-CORTE-B.md](docs/prompts/PROMPT-02-CORTE-B.md).

`diagScores()` va aparte, y es el insumo de la decisión 2: calcula el score de la población
contra todos los candidatos de `B` y vuelca la distribución en `DIAG_SCORES`, con un barrido de
umbrales. **El veredicto y el barrido salen sólo de la ventana de análisis** (3.5); la solapa
trae las 103 históricas con una columna `en_ventana`. **Es lo que convierte `UMBRAL_MATCH` y `MARGEN_MINIMO` de suposición
en número medido.** Sólo lectura, y no estampa ningún `RDV_UID`.

Además reporta **techo alcanzable** por fila: cuánto podría sumar como máximo ese par dadas las
señales que existen. Sin barrio el techo baja a 0,90 y sin hora a 0,80, así que puede haber
filas que **no lleguen al umbral aunque todo coincida**. Eso no es un match fallido, es un
umbral inalcanzable — y hay que verlo antes de fijar el número.

Y las tres mediciones que sostienen el diseño:

- **pares `figura + fecha` repetidos** en el destino → los 8 encontrados son desfase por
  reprogramación, no excepciones a la regla (1.a). Se cruzan contra `STATUS REUNIÓN` para
  confirmarlo;
- **barrio por mes en `B`** → desde cuándo el origen dejó de mandarlo (3.3.b);
- **comuna en el texto** → de las 103, cuántas la traen y cuántas coinciden con la comuna que
  deriva del barrio del destino. Es la medida de si la comuna sirve de reemplazo.

### Fase 1c — Anclar la fecha  *(CERRADA: descartada)*

> **No se hace.** `diagFechaFin()` mostró que `fecha_fin` no sirve de ancla —es el cierre del
> formulario, no la fecha de la reunión— y, sobre todo, que el
> error está **en el medio y no en los extremos**: casi todo el desvío vive entre 2 y 7 días, y
> ahí ninguna ventana discrimina. Detalle en 3.3.c.
>
> La fase existía para elegir el ancho de `VENTANA_FECHA_TEXTO`. Ese ancho no existe.
>
> **Lo que la reemplaza, en dos frentes:**
>
> 1. la fecha deja de ser componente de la clave y pasa a ser **una señal del score con
>    tolerancia** (decisión 2), y la identidad se resuelve por `RDV_UID` (**Fase 2b**);
> 2. el parser **sí** se arregló, pero por otro camino: **la regla del mes** (1.c), que no
>    calibra una distancia sino que descarta lo imposible. Llegó del lado del negocio, no de la
>    medición — y es la lección de la fase: veníamos buscando el ancho correcto de una ventana
>    cuando lo que faltaba era una restricción.

> **Y ojo con el orden en que se hicieron las cosas.** El ancla se midió durante semanas y se
> descartó; la regla del mes la contestó el equipo en una frase. Antes de calibrar un umbral
> contra los datos, conviene preguntar si alguien ya sabe la respuesta.

`diagAnclaFecha()` queda en el repo como registro de la medición. No hay que volver a correrlo.

**La pregunta que decide el arreglo:** si `B` es una ventana móvil del origen que deja caer
eventos viejos, ampliar las listas de nombres y barrios no alcanza y **B2 tiene que pasar a ser
acumulativo** en vez de un espejo del import. Las dos ramas y sus costos están en **3.1.f**;
lo esperable es encontrarlas mezcladas.

### Fase 2 — Base limpia  *(en curso, NO cerrada)*

> **Estado al 24/09/2026.** Hecho: `00_Config.js`, `01_Utils.js`, `02_Parsing.js`,
> `05_Escritura.js`, `SRC_SHEET` arreglado, 14 archivos a `_archivo/`, y el bloque duplicado
> de `Upset Base FInal.js` eliminado.
>
> **La verificación de duplicados NO pasa todavía**, y no es un descuido: es un conflicto de
> orden. Ver "Por qué la Fase 2 no cierra", abajo.
- **`detectFecha_` con la regla del mes** (1.c / 3.3.c). Reemplaza al ancla, que quedó
  descartada: el año y el mes salen de `fecha_fin`, el día del texto, y una ocurrencia con un
  mes imposible se descarta en vez de arruinar la fila. `diagCorteB()` midió que no resuelve
  ninguna de las 20 que se llamaban `fecha_mal_parseada` — porque no eran de mes: son
  `desfase_reprogramacion`, y las cubre la tolerancia de ±3 del score (3.3.c).
- `00_Config.js` **ya está escrito** (IDs, solapas, `COLUMNAS_MANUALES`, `COLUMNAS_DERIVADAS`,
  `VENTANA_ALERTA_DIAS`). `01_Utils.js`, `02_Parsing.js` (con `detectComuna_` y la regla del
  mes; el ancla de fecha quedó descartada) y `05_Escritura.js` también están escritos.
- Al escribir `01_Utils.js`, reemplazar los helpers `_alerta` provisorios de `40_Alertas.js`.
- `setSiDelSistema_` escrito y probado **antes** que cualquier cosa que escriba en el destino.
- `num()` deja de convertir vacío en cero: vacío se propaga como vacío (sección 0.a).
- Mover a `_archivo/` todo lo listado arriba y **borrarlo del proyecto de Apps Script** para
  que salga del scope global (queda en git).
- **Antes de arreglar `SRC_SHEET`: apagar el activador de `runFullPipelineWithDelays`.**

  > Hoy ese activador es **inofensivo porque falla**: muere en el paso 1 y no escribe nada.
  > Arreglar la constante **lo despierta**. Un pipeline que lleva meses sin correr, sobre datos
  > que se movieron todo ese tiempo, escribiendo con el upsert legado —el que no tiene
  > `setSiDelSistema_`, el que pisa canales con ceros— es exactamente lo que el invariante
  > existe para impedir.
  >
  > **El orden importa y es contraintuitivo: primero apagar, después arreglar.** Al revés, entre
  > el arreglo y la baja hay una ventana en la que el activador corre solo.

- Arreglar `SRC_SHEET = 'A'` → `'Asistentes'`, con el activador ya apagado.
- Correr el pipeline **a mano** y revisar qué escribió, antes de volver a habilitar nada.
- Verificar que `clasp push` no deja duplicados: `grep -c "function toDate_"` debe dar 1.

#### Por qué la Fase 2 no cierra

La verificación da esto:

| helper | copias | dónde |
|---|---|---|
| `detectPersona_` / `detectBarrio_` / `detectFecha_` / `detectComuna_` | **1** ✓ | `02_Parsing.js` |
| `mapBarrioCanon_` | **1** ✓ | `Solapa agenda base final.js` |
| `toDate_`, `normalizeText_`, `str`, `num` | **4** ✗ | `01_Utils.js` + los tres del pipeline |
| `normalizeHeader_` | 3 ✗ | ídem |
| `findIdxOr_` | 2 ✗ | `01_Utils.js` + `Upset Base FInal.js` |

Los `detect*` llegaron a 1 porque `Código.js` se archivó, y `mapBarrioCanon_` porque se archivó
`Barrios.js` — **eso resuelve la mitad del bloqueante 3.1.h**: ya no hay dos implementaciones
compitiendo, aunque la que quedó viva sigue teniendo los alias cruzados hasta la Fase 8.

Lo que no baja a 1 son los seis helpers de `01_Utils.js`, y el motivo es concreto:
**tres archivos del legado no se pueden archivar todavía.**

| archivo | por qué se queda |
|---|---|
| `Upset Base FInal.js` | el **único activador vivo** lo necesita: `syncAgendaSheetInBaseFromAgenda_2` usa su `ensureColumnsExist_` y su `findIdxOr_` |
| `Sinc A to A2.js` | es el paso 1, y acaba de recibir el arreglo de `SRC_SHEET` |
| `Sync B to B2.js` | es el paso 2, se reescribe en la Fase 4 |

**Y no alcanza con borrarles los helpers**, que sería lo obvio. `num` cambió de comportamiento a
propósito —devuelve `''` y no `0` cuando no hay dato (sección 0.a)— y esos tres archivos hacen
aritmética con él: `num(a) + num(b)` con vacíos concatena strings en lugar de sumar. Sacarles su
copia los rompería de una forma nueva.

> **Consecuencia que hay que tener presente: `01_Utils.js` y `02_Parsing.js` todavía no son
> confiables.** El prefijo `01_` hace que carguen **primero**, así que las copias del legado los
> **pisan**. No cambian el comportamiento del legado, y tampoco son las versiones que corren. Es
> inerte y engañoso a la vez, y está avisado en el encabezado de los dos archivos.

#### Pendiente: los `leg*_` duplicados entre los tres archivos del legado

El rename de la Fase 2 (`077cada`) les puso prefijo `leg` a los helpers del legado para
separarlos de `01_Utils.js`, pero **entre los tres archivos del legado siguen duplicados**, y
en Apps Script gana la última copia que carga (3.1.c). Son los **7 duplicados top-level** que
quedan en el scope que sube clasp. Relevado el 2026-09-25, **sin cambiar
nada**:

| helper | copias | ¿cuerpos distintos? |
|---|---|---|
| `legNormalizeText_` | `Sinc A to A2.js`, `Sync B to B2.js`, `Upset Base FInal.js` | sólo en espacios: **mismo comportamiento** |
| `legNormalizeHeader_` | `Sinc A to A2.js`, `Upset Base FInal.js` | sólo en espacios: **mismo comportamiento** |
| `legStr_`, `legNum_` | los tres | idénticos |
| `agendaHeaders_`, `agendaIdx_` | `Agenda push a base.js`, `Agenda traer datos del mail.js` | idénticos (mismo hash) |
| **`legToDate_`** | los tres | **sí.** A2 y Upset: día primero (`03/04` = 3 de abril) y fijan las 12:00. **B2: `new Date(string)`** (`03/04` = 4 de marzo) y devuelve el `Date` sin fijar hora |

> **Estado: LATENTE. No afecta hoy** (medido con `diagLegToDate()`, 25/09 23:26):
>
> - gana una copia **día primero** (A2/Upset): `'03/04/2026'` → `03/04`, y el `Date` de las
>   15:30 → `12:00`;
> - a la línea 72 **no le llega ningún `string`**: `Fecha (manual)` vacía en las 5 filas, y lo que
>   llega son 4 `Date` de `Fecha (auto)`.
>
> El riesgo que queda: que un `clasp push` cambie el orden de carga y gane la copia de B2,
> **combinado** con una fecha tipeada como texto en `Fecha (manual)`. Hacen falta las dos cosas.
> El arreglo, cuando toque —a más tardar en la **Fase 9**—, es que **las tres copias lean el día
> primero**. No se tocó `legToDate_` ni el activador. Rehacer la medición con
> `rehacer_verificarLegToDate()` si cambia el orden de los archivos o alguien empieza a cargar
> `Fecha (manual)`.

**`legToDate_` sí se usa hoy.** Además de los tres pasos
apagados, la llama el **único activador vivo**: `syncAgendaSheetInBaseFromAgenda_2`
(`Solapa agenda base final.js:72`), para la fecha que escribe en la solapa espejo `Agenda` del
**workbook del destino (1)** (`DEST_SS_ID`, no la intermedia), la que entra en el ID
(`buildIdFinal_`) y la que ordena. También la usan los dos
archivos de Agenda que corren a mano y `Barrio desde Base.js` (apagado).

Qué tan grave es:

- **verificado sobre el código** (las tres copias corridas en Node, zona de Buenos Aires): con
  un `Date` las tres dan **el mismo día**; sólo cambia la hora (A2/Upset fijan las 12:00, B2
  deja la original). Lo que la línea 72 hace después —formatear `dd/MM/yyyy` para el ID,
  escribir en la solapa espejo, ordenar— no depende de la hora. **Con `Date`, no importa qué
  copia gane.** Con `string` sí: B2 lee `03/04` como 4 de marzo, da `null` para `13/04` y corre
  `2026-04-03` al día anterior;
- **verificado sobre el código:** `Fecha (auto)` la escribe la ingesta como `Date` con formato
  `dd/mm/yyyy` (`Agenda traer datos del mail.js:190-204`). `Fecha (manual)` la tipea una
  persona, y puede ser `Date` o `string` según cómo la reconozca Sheets;
- **medido (25/09 23:26)** con `diagLegToDate()` (`diagnostico/04_legado_fechas.js`,
  `rehacer_verificarLegToDate()`): gana una copia día primero y a la línea 72 sólo le llegan
  `Date`. Ver el recuadro de arriba. El orden de carga sigue sin estar fijado
  (`filePushOrder` vacío): lo que se midió es el orden de hoy.

**Qué hacer, y cuándo:** que las tres copias lean el día primero (o que quede una sola), a más
tardar en la Fase 9. No hay urgencia medida. Se resuelve solo cuando las Fases 4 y 5 se lleven
esos archivos (abajo), **salvo** el uso en `Solapa agenda base final.js`, que llega hasta la
Fase 8.

**Cuándo cierra.** Cuando los tres archivos dejen de existir, y eso pasa solo:

1. **Fase 4** reescribe la lectura de orígenes → se va `Sync B to B2.js`;
2. **Fase 5** reescribe el upsert → se va `Upset Base FInal.js`, y con él el último
   `findIdxOr_` y `ensureColumnsExist_` duplicados;
3. `Sinc A to A2.js` se va con el mismo movimiento de la Fase 4.

Queda entonces `Solapa agenda base final.js`, que cae en la **Fase 8**.

→ **La verificación de duplicados se mueve de la Fase 2 al final de la Fase 5**, que es donde
puede dar 1. Mantenerla en la Fase 2 era pedirle a la fase que resolviera algo que depende de
dos fases posteriores.

### Fase 2b — Estampar `RDV_UID` ya  *(adelantada: era Fase 4)*

**Se adelanta todo lo que el plan permite.** El motivo es simple y urgente:

> **Cada día sin uuids, más filas se vuelven inidentificables.** No hay clave natural (3.2) y el
> origen sigue mandando formularios con menos información que el mes pasado. Las filas que
> **hoy** todavía matchean son las que vamos a poder anclar; las que entren mañana, no.

Se puede hacer ahora, antes de la Fase 3, porque **no choca con nada**:

- `RDV_UID` va como **columna nueva al final** (`AP`). Las once fórmulas de array viven en `D`,
  `W`, `X`, `Y` y `AA`–`AG`: todas antes. Agregar al final no las toca (3.1.b);
- cada escritura es sobre una **celda vacía**, así que `setSiDelSistema_` alcanza y ya está
  escrito (Fase 2);
- **no necesita el score.** Esta fase estampa **sólo lo que ya matchea sin ambigüedad**.

Qué hace, y qué deja para después:

**`correrFase2b()`, en `05_Escritura.js`.** Agrega las cinco columnas de `COLUMNAS_TRAZA` que
falten, **solo el encabezado, en la primera columna libre al final**. Nunca
`insertColumnBefore`: desplazar una columna correria los fondos respecto de sus filas (seccion
6). Es idempotente — volver a correrlo no hace nada.

> **Cambio respecto de la version anterior de esta fase: el estampado ya no va aca.**
>
> Estaba planteado como "estampar las ~699 que matchean por clave natural, sin score". Con la
> corrida en seco hecha, eso seria un **segundo mecanismo de estampado** al lado del que ya
> tiene el upsert, decidiendo con un criterio distinto sobre el mismo conjunto. Dos caminos que
> escriben la misma columna con reglas diferentes es exactamente lo que produjo los dos
> `mapBarrioCanon_` (3.1.h).
>
> **El estampado lo hace la primera corrida del upsert con `DRY_RUN = false`**, que es el unico
> lugar que decide que matchea. Esta fase solo prepara el lugar donde escribir.

Verificacion: correr `correrEnSeco()` despues, y que el aviso de columnas faltantes desaparezca.

> Lo que se gana es irreversible en el buen sentido: una vez estampado, **el origen puede
> cambiar lo que quiera** y esa fila sigue siendo encontrable. Es la única parte del plan que
> se vuelve más barata cuanto antes se haga, y más cara cada semana que pasa.

### Fase 3 — Derivadas a valores

**Es prerrequisito duro de la Fase 9.** No se saca el staging con las fórmulas de array
todavía puestas: sería poner un upsert nuevo a escribir contra once bloques que se rompen
enteros con un `setValue` mal ubicado. Terminada esta fase, esa clase de problema no existe más.

- Escribir `recalcDerivadas_()` y correrlo **sobre una copia** de (1).
- Comparar columna por columna contra el original. Deben coincidir en las 802 filas.
- Recién ahí: borrar las once fórmulas del original y correr el recálculo.
- El límite de la fila 2374 desaparece con esto.
- `COLUMNAS_DERIVADAS` (decisión 9) deja de ser una lista de cosas prohibidas y pasa a ser la
  lista de lo que calcula `recalcDerivadas_()`. **No se borra del config**: el upsert las sigue
  sin tocar, porque las escribe el recálculo y nadie más.
- Verificar que ninguna quedó con fórmula:
  `getRange(1,1,1,ultimaCol).getFormulas()[0].filter(String)` tiene que dar vacío.

### Fase 4 — Lectura directa
- `10_LeerOrigenes.js` con `openById`.
- **El `RDV_UID` ya está**: se adelantó a la Fase 2b. Acá sólo hay que asegurarse de que la
  lectura nueva lo propague y de que las filas nuevas de A2/B2 nazcan con uuid.

### Fase 5 — Upsert nuevo  *(escrito, en DRY_RUN)*

> **`20_UpsertDestino.js` ya está en el repo, con `DRY_RUN = true`.** Calcula todo, llena
> `SIN_MATCH`, `REVISAR_MATCH` y `EMPAREJAR_MANUAL`, y **no escribe una sola celda del destino**.
>
> **Ese modo no es una precaución: es el modo en el que se calibra.** `UMBRAL_MATCH` y
> `MARGEN_MINIMO` están puestos a ojo, y los números de la corrida en seco son los únicos que
> pueden fijarlos. Mover el umbral y volver a correr, hasta que el reparto entre `escribiría`,
> `a revisar` y `sin match` sea el que se quiere.
>
> Los candidatos salen de **`B`, el import crudo, y no de B2**: B2 es un espejo que pierde
> justamente las filas que no pudo indexar (3.1.f), así que buscar ahí sería heredar el problema
> que venimos a resolver.

#### Calcular, loguear, escribir — en ese orden

La primera corrida en seco (25/09) murió con `Service Spreadsheets timed out` **escribiendo el
segundo reporte**, y se llevó puestos los tres números que hacían falta, que ya estaban
calculados. Es la segunda vez que pasa: la misma excepción tiró `diagFase1()` el 22/09.

La estructura que quedó:

1. **`calcularPlan_()`** hace todo el trabajo caro —802 × 776 evaluaciones— **en memoria**, sin
   tocar una celda;
2. **`logResumen_()`** imprime los tres números **antes de escribir nada**. Si después se cae el
   servicio, la corrida sirvió igual;
3. **`escribirReportes_()`** escribe cada solapa **aislada en su try/catch**, con reintento y
   espera. Una caída no se lleva a las otras, y el log dice cuál rehacer.

Dos detalles que no son cosméticos:

- **`SIN_MATCH` va último.** Es el que más filas escribe (103 en la corrida real), así que es el
  más probable que falle. Antes iba primero y arrastraba a los otros dos.
- **Un entry point por reporte** —`soloRevisarMatch()`, `soloEmparejarManual()`,
  `soloSinMatch()`— para rehacer uno sin recalcular los otros. Recalcular cuesta segundos, pero
  volver a jugarse a que el servicio ande, no.

**La lección, que vale más allá de este archivo:** cuando un cálculo caro alimenta una escritura
frágil, el resultado se loguea antes de escribirlo. Si no, una falla de infraestructura se lleva
puesto trabajo que ya estaba hecho y era correcto.

#### El resultado de la corrida en seco (2026-09-25)

```
base: 802 filas del destino · candidatos en B: 776 (3 anulados por NO USAR)

escribiría   654   81,5%
a revisar     45    5,6%    40 margen_chico + 5 multi_figura
sin match    103   12,8%    103 score_bajo · 0 sin_candidatos
                            ^ ninguna es irrecuperable

formularios sin candidato: 11 | filas del destino sin ninguno: 0
```

> **`0 sin_candidatos` es el numero que mas cambia el panorama.** El sistema **puede proponer
> algo para el 100% de las filas del destino**. Lo que queda verdaderamente irresoluble son
> **11 formularios huerfanos** — no filas de la base.
>
> Da vuelta la hipotesis con la que veniamos: esperabamos que las 103 no tuvieran con que
> emparejarse. Tienen candidato; lo rechaza el umbral. El problema no era falta de informacion,
> era el corte.

#### El umbral sale de un valle medido: 0,88

La distribucion de scores tiene **dos poblaciones separadas por un hueco limpio**:

| score | filas | |
|---|---|---|
| >= 0,90 | **690** | los matches buenos |
| 0,80-0,90 | **2** | el valle |
| ~0,65 | **82** | les falta una senal entera |

`UMBRAL_MATCH` pasa de **0,75 a 0,88**. Con 0,75 los 16 casos de la zona 0,70-0,80 entraban
**sin razon clara**, que es exactamente la zona gris que un umbral deberia evitar. En 0,88 el
corte cae **adentro del valle**, o sea donde mover el umbral un poco no cambia el resultado —
que es la propiedad que uno quiere de un corte.

**No es una eleccion: es una medicion.** Y por eso `UMBRAL_MATCH` deja de estar marcado como
provisorio. `MARGEN_MINIMO` sigue a ojo.

#### Por que NO se baja el umbral para capturar las 103

Es la tentacion obvia y hay que nombrarla para descartarla:

> **Un score de 0,65 no es "casi bien": es una fila a la que le falta una senal entera.**

Con la normalizacion, 0,65 sobre las senales disponibles significa que **una de las que habia no
coincidio**. Bajar el corte para incluirlas es **escribir con menos evidencia justo donde
sabemos que los datos estan mal** — las 103 son precisamente las filas del hueco, las que no
tienen barrio y tienen la fecha rota.

Esas 103 van a `EMPAREJAR_MANUAL`, que existe para eso. Y con **cero sin-candidato**, la revision
es finita: cada una tiene algo concreto que mirar.

#### La autopsia del grupo bajo, y cuanto aporta la comuna

Saber que 82 filas dieron 0,65 no alcanza: hace falta saber **qué les costó score**. Y ahí hay
una trampa que conviene tener clara antes de leer cualquier número.

> ### ⚠️ Bajo normalización, una señal ausente es GRATIS
>
> El score es `obtenido / alcanzable`, y una señal que no se puede evaluar **sale de los dos
> lados**. O sea:
>
> **una fila a la que sólo le faltara el barrio puntuaría 1,00 y ni siquiera estaría en el
> grupo bajo.**
>
> La hipótesis de que el grupo de 0,65 es "todo bien salvo el barrio" —porque 0,90 − 0,65 ≈ 0,25,
> que es el peso del barrio— **es aritméticamente imposible.** La resta engaña: el peso del
> barrio no se resta del numerador, desaparece del cálculo.

Qué produce realmente un 0,65, calculado sobre los pesos **de ese momento** (con la tolerancia
de ±3 de 3.3.c, las dos filas de ±1 y ±3 pasan a dar **1,00**):

| combinación | score |
|---|---|
| figura + fecha exacta, sin ubicación evaluable | **1,00** |
| figura + fecha ±1, sin ubicación | 0,91 → hoy 1,00 |
| figura + fecha ±3, sin ubicación | 0,77 → hoy 1,00 |
| **figura + fecha ±7, sin ubicación** | **0,63** ← esto |
| **figura + fecha mala + comuna coincidente** | **0,63** ← o esto |
| figura + fecha ±7 + comuna coincidente | 0,70 |

> **El grupo bajo es un problema de FECHA, no de barrio.** Y la consecuencia práctica invierte
> lo que esperábamos: **agregar la comuna no los rescata.** `figura + fecha±7 + comuna` da 0,70,
> que sigue debajo de 0,88. La comuna sube el numerador **y** el denominador.

Por eso `logResumen_` clasifica por **déficit**, no por ausencia: cuánto peso perdió cada señal
**evaluable** que no coincidió del todo. Y reporta aparte la **banda de fecha** dentro del grupo
bajo, que es el número accionable — si domina `±7`, el trabajo está en 3.3.c y no en la comuna.
Ahora también el **desvío real día por día** y las tres poblaciones (ver 3.3.c, *"Las 20 no
eran errores de parseo"*): una banda agregada escondía que "lejos" no es reprogramación.

Y en el mismo paso mide **la comuna**, que es la señal que viene a reemplazar al barrio:

- **cobertura general** de `detectComuna_` sobre los 776 formularios;
- **cobertura en el grupo bajo**: cuántas de esas filas tienen comuna en el nombre;
- de esas, en cuántas **coincide** con la comuna que deriva del barrio del destino;
- y **los casos que difieren, listados uno por uno** — con diez o quince se ve si lo que falla
  es el parser o es el dato.

> **La comuna sólo rescata a las filas cuyo déficit NO era la fecha.** Si el bloque 2b muestra
> que domina `±7`, la comuna puede tener cobertura perfecta y aun así no mover a casi nadie por
> encima de 0,88. Hay que mirar los dos bloques juntos, no uno solo.
>
> **El peso de 0,15 no se toca hasta tener esos números.** La medición anterior (35 filas, 21
> coincidían, 10 diferían) fue sobre otra población y con el parser viejo: no dice nada sobre el
> estado actual.

#### La densidad de `EMPAREJAR_MANUAL`, y por que la puerta usa Y

La primera version proponia un par si compartia figura **o** caia dentro de +-21 dias. Resultado:
**1.883 pares para 103 filas, o sea 18 por fila.** Con ese criterio entra cualquier reunion de la
misma figura del ultimo ano.

> **Una lista que nadie mira es peor que no tenerla: ocupa el lugar de la que si serviria.**

La puerta pasa a **Y**: misma figura **y** dentro de ±21 días. Y si alguna fila se queda sin par
propuesto, aparece en el bloque de huérfanas — **es información honesta**, a diferencia de 18
pares falsos.

#### Corrección: el **Y** se pasó de estricto, y la culpa no era de la ventana

El cambio de **O** a **Y** llevó los formularios huérfanos de **11 a 81** y las filas del destino
sin ningún candidato de **0 a 56**. Es un salto grande y vale entenderlo antes de tocar otra cosa:

> **Lo que explotaba la lista era el `O`, no el ancho de la ventana.** Con `O`, un formulario
> entraba por compartir figura **aunque la fecha estuviera a un año**. Con la figura ya
> obligatoria, ensanchar la ventana **no puede** reintroducir el producto cartesiano.

Pero el `Y` de dos términos dejaba afuera un caso entero: **las reuniones temáticas** (1.d) y las
filas con la **fecha rota** (3.3.c) no tienen cómo pasar la única vía que quedaba. Quedaban fuera
de la propuesta manual **por no tener ubicación**, que es justamente lo que hay que resolverles.

La puerta queda con **tres vías**:

```
figura  Y  ( fecha dentro de ±VENTANA_EMPAREJAR_DIAS  O  comuna coincide  O  evento coincide )
```

Sigue siendo **Y** en la figura, que es lo que evitó los 1.883 pares. Las otras dos vías son
alternativas entre sí, no requisitos acumulados.

El log reporta ahora la **densidad** (pares por fila y por formulario) y avisa si pasa de 5. Era
la metrica que faltaba: *1.883* sonaba a "mucho trabajo", *18 por fila* dice que la lista es
inutilizable. El objetivo es **2 a 4**.

> **Corrección: la vía del evento se sacó.** Con ella la densidad pasó de **2,6 a 8,2 pares por
> fila**: `EVENTO` coincide con el 90% de las filas y abría la puerta a casi cualquier par de la
> misma figura. La puerta queda
>
> ```
> figura  Y  ( fecha dentro de ±VENTANA_EMPAREJAR_DIAS  O  comuna coincide  [O eje coincide] )
> ```
>
> con el eje detrás de `EJE_COMO_UBICACION`, que se suma cuando se confirme el mapeo (1.d).

#### Las filas de comuna coincidente que no entran (las 65 `deberia_haber_entrado`)

Casos como `francisco quintana|villa santa rita|20260423 ← Comuna 11 - 23/4` (Villa Santa Rita
es Comuna 11): la comuna coincide y quedan afuera igual. Con figura + comuna deberían llegar
alto aun con la fecha corrida.

**Antes de culpar a la fecha, un dato estructural:** en `diagCorteB()`, `deberia_haber_entrado`
es lo que queda **después** de descartar persona, barrio y fecha — o sea que en esas filas el
legado reconoció la persona y la fecha **le coincidió exacta**. Si la fecha coincidía, no es la
fecha la que las tira. La tolerancia de ±3 (3.3.c) sube a las que están corridas, pero para
éstas hay que buscar otra causa.

La candidata más fuerte es **la figura**: el legado reconocía personas con regex que admiten
variantes (`pin(?:eiro|n?eiro)`, `quiro(?:s|z)`), y `figurasEnTexto_` busca **el nombre exacto
de la columna `Figura` del destino**. Si el formulario escribe el nombre distinto, la figura no
suma, el formulario queda en 0,56 (fecha + comuna sin figura) y **uno lejano que sí nombra la
figura le gana**. Es el mismo mecanismo que puede explicar las 50 "lejos" del grupo bajo.

El bloque **2f** del log lo mide: para cada fila con un formulario relevante de su misma comuna,
toma el **más cercano en fecha** y dice si entró, y si no, por qué —
`figura_no_reconocida_en_el_formulario`, `fecha_a_4_7_dias`, `fecha_a_mas_de_7_dias`,
`gano_otro_candidato`, o el motivo del veredicto—, con los primeros 25 casos y quién les ganó.

#### La ventana de análisis llega al upsert (y las conclusiones de arriba hay que releerlas)

`20_UpsertDestino.js` se escribió **después** de los once reportes de `diagnostico/` y **no
heredó la cabecera de ventana**. O sea que todo lo que reportó la corrida del 25/09 salió de las
**802 filas históricas, desde julio de 2025**.

Eso no es un detalle de presentación. Mezcla el período en que el formulario todavía mandaba
barrio con el período en que dejó de mandarlo (3.3.b), que es exactamente la mezcla que la
ventana existe para evitar (3.5): **un número así describe un origen que ya no existe**, y
además lo describe más optimista de lo que es, porque esos datos traían una señal que hoy no
llega.

**Quedan en cuarentena, hasta la próxima corrida, estas tres conclusiones:**

| conclusión del 25/09 | por qué hay que releerla |
|---|---|
| *"domina la fecha, 52 de 112"* | las 112 incluyen filas de 2025. Si se concentran en el período viejo, el problema de hoy es otro |
| **81 formularios huérfanos** | ídem, y además los mide el `Y` de dos términos que acá arriba se corrigió |
| **56 filas del destino sin candidato** | ídem |

**Qué cambia en el código y qué no:**

- **el upsert sigue procesando las 802.** El backfill de la Fase 6 llena el histórico completo,
  así que filtrar lo que se *hace* sería romperlo. **La ventana filtra lo que se reporta y se
  calibra, no lo que se hace;**
- cada contador del log pasa a tener **dos lecturas**, `ventana | total`, y los porcentajes de
  cada columna se calculan **sobre su propia base** — comparar mezclando no dice nada;
- los **veredictos automáticos** del log (cuál señal domina, si el umbral se confirma) se sacan
  **de la columna de la ventana**;
- las tres solapas de reporte llevan columna **`en_ventana`**, como las `DIAG_*`;
- `inicioVentanaAnalisis_()` y `enVentanaAnalisis_()` pasan a `01_Utils.js`, y los `_diag`
  delegan: **una sola implementación**, como el resto del archivo.

#### El umbral se recalibra sobre la ventana, con un barrido

`UMBRAL_MATCH = 0,88` **salió del valle de la distribución histórica**. Un umbral calibrado
contra un origen que ya no existe es una suposición con cara de medición, así que la curva se
vuelve a calcular sobre los últimos 6 meses.

`_logValle_()` barre los cortes de 0,50 a 0,99 de a 0,01 y busca la **meseta más larga**: el
tramo donde mover el umbral **no cambia a cuántas filas afecta**. Ahí es donde un corte es
estable, que es toda la propiedad que se le pide a un umbral.

Y dice explícitamente los tres casos, en vez de dejarlos a interpretación:

| lo que da el barrido | qué significa |
|---|---|
| el 0,88 cae **adentro** de la meseta | se confirma, no hay que tocarlo |
| cae **afuera** | el log propone el medio de la meseta medida, para escribirlo en `00_Config.js` |
| la meseta ocupa **casi todo el barrido**, o mide menos de 3 pasos | **el barrido no calibra nada.** O la población está toda de un lado, o la distribución es continua y cualquier corte es arbitrario |

Ese tercer caso es el que faltaba. Un barrido siempre devuelve *algún* máximo; decir cuándo ese
máximo no significa nada es la diferencia entre una medición y una falsa alarma con formato de
dato (§6).

#### Lo que dio la corrida parcial del 25/09

Alcanzó a calcular todo antes de caerse:

```
Destino: 802 filas con datos | candidatos en B: 776 (3 anulados por "NO USAR")
SIN_MATCH: 103 filas
```

**103 es exactamente la población de `DIAG_CORTE_B`** — las filas del destino sin contraparte en
B2. Con los umbrales provisorios, **el score no recuperó ninguna**.

Hay dos lecturas y todavía no sabemos cuál es:

| si | entonces |
|---|---|
| esas 103 salieron por **`score_bajo`** | tienen candidato y lo rechaza el 0,75. Bajar el umbral las recupera |
| salieron por **`sin_candidatos`** | no hay con qué emparejarlas y **ningún umbral las salva** |

Por eso `logResumen_` ahora desglosa `SIN_MATCH` por motivo y dice explícitamente cuál de las
dos es. Es la diferencia entre "el umbral está mal calibrado" y "falta información en el
origen", que llevan a trabajos completamente distintos.

- `20_UpsertDestino.js` con match uuid → score → `SIN_MATCH`.
- **Toda escritura por `setSiDelSistema_`. Cero `setValue` sueltos.** Revisar el diff con
  `grep -rn "setValue\|setValues" 20_UpsertDestino.js` — tiene que dar cero.
- `COLUMNAS_MANUALES` chequeadas antes que nada: esas siete ni se intentan.
- `marcarRealizada_` enganchada al upsert (decisión 12), con los asistentes que vienen de A2.
- Correr en seco (modo `DRY_RUN` que sólo llena `SIN_MATCH` y loguea) antes de habilitar escritura.

### Fase 6 — Backfill
- Correr el pipeline completo sobre la ventana abril–septiembre 2026.
- Objetivo: las 79 filas sin sexo/edades y las 17 sin inscriptos.
- Verificar contra el conteo de la sección 3.2.
- **El origen del backfill no es `Para Revisar`.** El diagnóstico lo descartó: es un espejo del
  destino y no tiene nada que el destino no tenga. Los datos hay que sacarlos de `B`, y lo que
  ya no esté en `B`, del origen (3) — con la regla dura de la sección 1: se lee, no se modifica.
- Correr con `setSiDelSistema_`: el backfill escribe sobre celdas vacías, que es justo lo que
  son las 79. Ninguna de estas filas debería pisar nada.

### Fase 7 — Activadores del pipeline de inscriptos
- **Dar de baja los activadores viejos del pipeline de inscriptos** (ahora sí, con el inventario de Fase 0 a mano).
- Crear los nuevos apuntando a `99_Pipeline.js`.
- Agregar `onOpen()` con menú para poder correr a mano sin abrir el editor.
- **Enganchar `verificarCambiosRecientes_()` al final de `99_Pipeline.js`** (decisión 11), después
  del upsert y del recálculo de derivadas. Hasta entonces se corre a mano con
  `correrAlertaCambios()`.
- Revisar `ALERTA_CAMBIOS` la primera semana: si se llena, no es que todo cambió — es que algún
  guard está mal calibrado. Si queda vacía con el pipeline corriendo, tampoco está bien: probar
  a mano moviendo un número en una copia.

> **No lleva `onEdit`.** Estuvo anotado acá y se descartó: ver el recuadro al final de la
> sección 0. Servía sólo para habilitar "vacío o azul" en `setSiDelSistema_`, y eso servía sólo
> para propagar correcciones del origen. El origen no corrige. El aviso de que un número cerrado
> se movió lo da `verificarCambiosRecientes_()` al final del pipeline, sin tocar el destino.

### Fase 8 — Agenda  *(al final, a propósito)*

Agenda **no se toca hasta acá**. Los motivos:

- **no hay urgencia**: de sus tres pasos sólo el espejo tiene activador, y el espejo no escribe
  datos nuevos (docs/agenda-legado.md);
- **no hay material para decidir**: rediseñar la ingesta requiere saber cuántas variantes de
  formato de mail hay, y eso hoy no lo sabemos. El legado mira 21 días hacia atrás y no guarda
  nada, así que **el material se junta antes y se analiza después**;
- **el flujo de inscriptos es el que tiene el hueco**, y es el que se cierra primero.

**8a. Análisis de patrones de mails.** `diagnostico/03_muestras_mail.js`, sólo lectura, sin
activador. **Corrió el 2026-09-24**: 376 mensajes en 374 hilos, de 2025-09 a 2026-09, volumen
estable entre 24 y 43 por mes y sin cortes.

Lo que ya contestó (detalle en [docs/agenda-legado.md](docs/agenda-legado.md)):

- **el asunto nunca cortó la ingesta.** Las 103 "variantes" son una sola plantilla con dos
  campos: `Agenda Encuentros de vecinos con {GRUPO} - Semana del {DD/MM} al {DD/MM}`, con tres
  valores de `{GRUPO}` y el rango cambiando cada semana. Si la ingesta no encuentra eventos, el
  problema está en el cuerpo;
- **el asunto trae el rango de la semana**, que es una restricción externa sobre las fechas de
  los eventos. Ver 3.3.c.

Lo que falta contestar:

- cuántas variantes de estructura tiene el **cuerpo**, y si el parser cubre todas o sólo la que
  estaba vigente cuando se escribió;
- **si el último mensaje del hilo es el correcto.** Hay hilos de hasta 10 mensajes y el legado
  se queda siempre con el último: si la corrección vino en uno del medio y después alguien
  respondió algo trivial, está tomando el equivocado.

**8b. Rediseño de la ingesta.** Con el análisis hecho. Mínimo: un activador (hoy no tiene) y una
alerta cuando la query devuelve cero mensajes habiendo mails que matchean el asunto — hoy eso
termina con un `toast` de cuatro segundos y un `return` limpio.

**8c. Redirigir el push al upsert nuevo.** `agenda_pushReadyToBaseFinal` deja de escribir en
`Para Revisar` y pasa por el upsert, con `setSiDelSistema_`. Es lo que habilita la Fase 9.

**8d. Una sola canonización de barrios.** `Solapa agenda base final.js` es el último archivo con
`mapBarrioCanon_` propio, y es el que tiene los alias cruzados de 3.1.h. Se borra y usa
`canonizarBarrio_` de `02_Parsing.js`.

> **Pendiente hasta acá:** el punto 5 de [docs/agenda-legado.md](docs/agenda-legado.md) —qué se
> rescata, qué se adapta y qué se reescribe— es una **opinión formada leyendo el código, no una
> decisión tomada**. Se confirma o se descarta con el análisis de 8a en la mano.

### Fase 9 — Retiro del staging  *(última, y depende de la Fase 8)*

> **Ya no bloquea nada.** El diagnóstico mostró que el staging no pierde datos: cero cortes en
> los pasos 4 y 5, y `Para Revisar` es un espejo exacto del destino. Sacarlo es **simplificación,
> no cura** — deja el sistema más fácil de entender y le saca una clave de encima, pero no
> recupera ni una fila. El hueco está en `B → B2` (sección 3.2) y ahí va el esfuerzo primero.
>
> El paso 2 de la lista original — "backfillear desde `Para Revisar` lo que nunca cruzó" —
> **queda sin objeto**: no hay nada ahí que el destino no tenga.

Cuando le llegue el turno, el orden sigue siendo obligatorio.

**Prerrequisito duro: la Fase 3 tiene que estar terminada.** Con las once fórmulas de array
todavía puestas, cualquier escritura mal ubicada del upsert nuevo rompe un bloque entero y el
daño es silencioso. Convertidas a valores, esa clase de problema desaparece y el retiro del
staging es un cambio de ruteo y nada más.

**Prerrequisito duro: la Fase 8 terminada.** El flujo Agenda es el único que todavía escribe
en `Para Revisar`, así que el staging no se puede retirar antes. Reordenar el plan para poner
Agenda al final movió esta fase con él.

**Prerrequisito duro: `setSiDelSistema_` escrito y probado** (Fase 2). El paso 5 protege hoy la
carga manual del destino por accidente, escribiendo sólo sobre celda vacía; si se lo saca sin
el helper, el upsert nuevo hereda el `setIfIndex_` del legado y pisa todo.

1. **El flujo Agenda ya redirigido al upsert nuevo** (Fase 8c). Es la única dependencia real
   del staging, y es lo que empuja esta fase al final del plan.
2. **Apagar el activador del paso 5**, si existe (Fase 0 dice cuál es). Dejar el código.
3. **Correr una semana sin el paso 5** y comparar contra `DIAG_*`. Nada nuevo tiene que faltar.
4. **Renombrar `Para Revisar` → `Para Revisar (legado)`.** El renombre rompe a propósito
   cualquier script que todavía la escriba: si algo se queja, es que quedaba una dependencia.
5. **Borrar `Sinc Base usuario.js`** del proyecto de Apps Script (queda en git).

**No se empieza por el 4 ni por el 5.** Hasta que el punto 3 esté verificado, `Para Revisar` es
la red que atrapa lo que el upsert nuevo deje pasar.

---

## 6. Convenciones

- **Nada de datos reales en el repo.** Es público. `fixtures/` tiene sólo encabezados, en CSV.
  `.gitignore` bloquea `*.xlsx`, `*.xls`, `.clasprc.json` (tiene el token de OAuth) y
  `node_modules/`.
- Un `const` top-level por nombre en todo el proyecto. Antes de `clasp push`, verificar
  que no hay duplicados en el scope global.
- **`.claspignore` decide qué entra al scope global.** Deja afuera `_archivo/`, cualquier clon
  anidado del repo, `docs/`, `fixtures/` y los `.md`. Sin él, `clasp push` sube `_archivo/` y
  el código archivado vuelve a competir por nombre (3.1.c). Antes de cada push:
  `clasp show-file-status` — tienen que aparecer sólo `appsscript.json`, los `.js` de la raíz y
  los de `diagnostico/`. Un archivo que se archiva sale del proyecto de Apps Script en el push
  siguiente, porque `clasp push` reemplaza el proyecto entero: **cotejar antes contra
  [docs/triggers-legado.md](docs/triggers-legado.md)** que no tenga activador vivo.
- Prefijo numérico en los archivos para fijar el orden de carga.
- Sufijo `_` para funciones internas (convención de Apps Script; no aparecen en el menú de ejecución).
- Fechas siempre a las 12:00 hora local para esquivar DST.

### `99_Correr.js`: el único lugar que se abre para correr algo

Todo lo que hay que ejecutar a mano desde el editor tiene un wrapper en
[99_Correr.js](99_Correr.js), nombrado para que el desplegable se lea como una secuencia
(`paso1_…`, `paso2_…`, `paso3_…`; y abajo `rehacer_…` para los diagnósticos ya corridos). El
encabezado del archivo dice la secuencia completa y el estado de `DRY_RUN`, así quien lo abre
sabe dónde está parado sin leer `docs/ESTADO.md`.

Dos reglas:

- **Nada de lógica propia.** Cada wrapper llama a una función y loguea qué hace, si escribe y
  dónde deja la salida. Un wrapper que calcula algo deja de ser un índice y pasa a ser un lugar
  más donde el criterio se puede desincronizar — la forma del bug de `mapBarrioCanon_` (3.1.h).
- **Se actualiza en el mismo commit en que cambia qué hay que correr**, igual que este
  documento y `docs/ESTADO.md`. Un índice que manda a correr lo que ya no corresponde es peor
  que no tener índice.

El prefijo `99_` es a propósito: carga último y no define nada que otro archivo use, así que no
puede pisar nada.

### Documentar a medida, no al final

**Si el próximo commit de código invalida algo que dice este documento, el documento se corrige
en ese mismo commit.** No en el siguiente, no en uno de limpieza al final.

No es prolijidad. En esta migración cambiamos de premisa **once veces**:

| lo que decía el documento | lo que medimos después |
|---|---|
| el staging pierde datos | cero cortes en los pasos 4 y 5 |
| el barrio falla por lista incompleta | el dato no viene desde 2025-10 |
| los 8 pares repetidos rompen la regla de una reunión por día | la regla se sostiene: es desfase por reprogramación |
| el desvío grande es la firma de una reprogramación | cero de los desvíos grandes son `Reprogramada` |
| `fecha_fin` sirve de ancla | no discrimina; el ancla queda descartada |
| `fecha_fin` y el texto son dos fuentes poco confiables, se compara contra las dos | `fecha_fin` es el cierre del formulario; el texto, con la regla del mes, es la fuente |
| la clave natural es el plan B | no hay clave natural |
| las 20 `fecha_mal_parseada` son errores del parser | texto y `fecha_fin` coinciden; el destino está corrido 1-3 días. Es reprogramación, y se arregla en la escala del score |
| `EVENTO` confirma las reuniones temáticas | coincide con el 90% de las filas: es una categoría, no un identificador |
| `Para Revisar` es el destino del flujo Agenda | es el staging del pipeline principal (`Upset Base FInal.js:7`); Agenda también escribe ahí |
| un caso `POST - JORGE MACRI - ...` justificó `limpiarPrefijos_` | **inventado**: no existe. **Beneficio medido para la figura: 0** (25/09 20:18: `EVITA multi_figura` 0 \| 0; `PIERDE la figura` 18 \| 41). Sale de `figurasEnTexto_`; los demás usos siguen sin medir. **No explica el 37,3% del 2f:** 18 formularios difícilmente dan 103 filas. Cuánto aporta lo dirá el paso 2; el resto no tiene causa medida |

Cada una de esas veces, **entre la medición y la actualización el documento decía algo falso**.
Y ése es justo el momento en que alguien lo abre para decidir. Un documento desactualizado no es
un documento incompleto: **es un documento que miente**, y con más autoridad que la ausencia de
documento, porque parece verificado.

La regla práctica: **decisión de diseño tomada, hallazgo en el código o premisa que cambia →
se escribe y se commitea en el momento.** No se acumulan tres hallazgos para un commit grande de
documentación.

### Un diagnóstico que grita por algo que no existe es peor que no avisar

**Una falsa alarma no es un costo cero: quema la confianza en los avisos que sí importan.**
Después de dos o tres, nadie mira el log, y el aviso bueno pasa desapercibido junto con los
otros.

Nos pasó **tres veces** en esta migración, y las tres con la misma forma — un número grande y
alarmante que en realidad no medía lo que parecía:

| el aviso decía | la realidad |
|---|---|
| el **staging** pierde datos entre B2 y el destino | cero cortes en los pasos 4 y 5. `Para Revisar` es un espejo exacto (3.2) |
| el **barrio** falla por lista incompleta de `detectBarrio_` | el dato no viene. Ninguna lista lo arregla (3.3.b) |
| el **asunto** de los mails cambió 103 veces | una sola plantilla con dos campos. Nunca cortó nada (docs/agenda-legado.md) |

Las tres mandaron a investigar un problema inexistente, y las tres tenían el mismo defecto de
diseño: **contaban una cosa y la presentaban como si midiera otra.**

Reglas que salen de eso, para cualquier diagnóstico nuevo:

1. **Agrupar por la forma, no por el valor.** 103 asuntos crudos son 3 plantillas. Antes de
   contar variantes, normalizar lo que se sabe que varía.
2. **Un conteo alto no es una conclusión.** Si el número no viene con una hipótesis de qué lo
   causa, es ruido con formato de dato.
3. **Decir explícitamente qué NO es señal.** El log de `diagMuestrasMail` reporta los asuntos
   crudos con la aclaración "ese número NO es señal de nada por sí solo". Cuesta una línea.
4. **Preferir la validación interna** a la comparación de dos fuentes, cuando exista: no
   necesita interpretación y no puede dar un falso positivo por desacuerdo (3.3.c).
- Toda escritura al destino pasa por el upsert, y dentro del upsert por `setSiDelSistema_`
  (sección 0). Nada de `setValue` / `setValues` sueltos.

### Formato: el color es información, no decoración

**Ninguna operación puede alterar fondos existentes en el destino.** El `#4F81BD` es la marca
de procedencia de la que depende el invariante entero; si se pierde, no hay forma de
reconstruirlo. Además, sólo hay **3 reglas de formato condicional** en `RVD JM-CM - ES` (sobre
la columna `A`, por nombre de figura): **todo el resto del color es estático**, o sea que vive
pegado a la celda y se pierde o se corre con cualquier operación estructural.

Prohibido contra el destino:

| prohibido | por qué | qué usar |
|---|---|---|
| `Sheet.clear()` | borra contenido **y formato** | `clearContents()` |
| `Range.clear()` | ídem | `clearContent()` |
| `sort()` | mueve los valores y deja los fondos quietos: cada celda queda con el color de otra fila | ordenar una copia, o leer a memoria y ordenar ahí |
| `deleteRow()` / `deleteRows()` | desplaza todo lo de abajo contra fondos que no se mueven igual | marcar la fila, no borrarla |
| `insertRow*()` en el medio | ídem | `appendRow` / escribir después de la última fila |
| `setBackground` con cualquier color que no sea `#4F81BD` | pisa la marca de procedencia | sólo `setSiDelSistema_` pinta |

Las tres reglas condicionales de la columna `A` sí se recalculan solas y no hay que preocuparse
por ellas. El problema es el otro 100% del color.

Antes de cualquier operación que toque estructura en el destino: leer los fondos con
`getBackgrounds()`, guardarlos, y verificar después. `DIAG_PROCEDENCIA` hace exactamente esa
lectura y sirve de línea de base.
