# Cómo resuelve conflictos `syncBaseFinal_ParaRevisar_y_RVD` (paso 5)

Lectura del código de [Sinc Base usuario.js](../Sinc%20Base%20usuario.js), 433 líneas, tal como
está en `main`. **Nada de este documento propone cambios**: describe lo que el paso 5 hace hoy,
porque es el único lugar del sistema donde ya existe una regla de procedencia y porque el
invariante de la sección 0 de `CLAUDE.md` se construye sobre ella.

Las dos hojas viven en la planilla (1): `Para Revisar` (staging, escrito por el paso 4) y
`RVD JM-CM - ES` (el destino que mira y edita el equipo). El código las llama `PR` y `USER`.

## La clave

La misma de todo el sistema, calculada igual en las dos hojas
([Sinc Base usuario.js:89-99](../Sinc%20Base%20usuario.js#L89-L99)):

```
normalizeText_(Figura) | normalizeText_(Barrio) | yyyyMMdd(toDate_(Fecha))
```

Si falta cualquiera de los tres, la fila no entra al índice y queda fuera de la sincronización
en silencio. El emparejamiento de columnas es por **encabezado normalizado**, no por posición.

## Las cuatro reglas, en orden

### 1. Clave sólo en el destino → se inserta la fila en `Para Revisar`

[líneas 147-184](../Sinc%20Base%20usuario.js#L147-L184). Copia todas las columnas de nombre
normalizado coincidente. Ignora las columnas cuyo encabezado es `#REF!`.

### 2. Clave sólo en `Para Revisar` → no pasa nada

[líneas 188-204](../Sinc%20Base%20usuario.js#L188-L204). **Se reporta y se descarta.** No hay
camino de inserción hacia el destino. Es el mismo agujero que el paso 4 (`CLAUDE.md` 3.1.d),
un escalón más abajo: una reunión que llegó a `Para Revisar` y no existe en el destino se
queda ahí para siempre.

### 3. Clave en las dos, celda a celda

Para cada columna común (excluyendo `#REF!`):

| estado | qué hace | ¿pinta? |
|---|---|---|
| **destino vacío, PR con valor** | escribe en el destino, si la columna no está bloqueada y la celda no tiene fórmula | **sí, `#4F81BD`** |
| **destino con valor, PR vacío** | escribe en PR **sólo si el valor NO es numérico** | no |
| **los dos con valor y distintos** | **no escribe nada.** Sólo lo anota en el reporte | no |
| los dos con valor e iguales | nada | no |

### 4. Reporte

Solapa `Reporte Sincronización BF` en la planilla **intermedia** (2), no en el destino
([líneas 384-398](../Sinc%20Base%20usuario.js#L384-L398)). Se reescribe entera en cada corrida
con `rep.clear()`. Una fila por acción y por diferencia detectada.

## La respuesta a "quién gana"

**Gana el usuario, siempre, pero por omisión y no por decisión.**

No hay ninguna rama del código que pise un valor existente en el destino. La única escritura
hacia el destino ([líneas 285-286](../Sinc%20Base%20usuario.js#L285-L286)) está detrás de
`if (!sUser && sPR)`: **la celda del destino tiene que estar vacía**. Cuando los dos lados
tienen valor y difieren, el código clasifica el caso como `'Diferencia'` con la acción
literal `'Sin cambios (prioridad usuario, solo se reporta la diferencia)'`
([líneas 365-380](../Sinc%20Base%20usuario.js#L365-L380)) y sigue de largo.

En la otra dirección la regla es distinta y más rara: destino con valor y PR vacío copia
hacia PR **sólo si el valor no es numérico** ([línea 306](../Sinc%20Base%20usuario.js#L306),
`isNumericLike_`). O sea que `Inscriptos`, los cinco canales, sexo y edades cargados a mano en
el destino **nunca vuelven a `Para Revisar`**. El staging queda permanentemente desactualizado
respecto del destino en todo lo numérico, que es justo lo que el pipeline recalcula.

> **Consecuencia que corrige la lectura de `CLAUDE.md` 3.2.** El riesgo de que el upsert pise
> los canales cargados a mano (`setIfIndex_` sin condición) **hoy se detiene en `Para Revisar`**.
> El paso 4 escribe los ceros de B2 en el staging sin preguntar, pero el paso 5 no los lleva al
> destino salvo que la celda del destino esté vacía. El trabajo manual del destino está
> protegido — **por accidente de esta regla, no por diseño**.
>
> Por eso el punto 4 de la nueva arquitectura (sacar el staging y escribir de B2 al destino con
> un solo upsert) **es exactamente el cambio que rompería esa protección**, si el upsert nuevo
> conserva el `setIfIndex_` del legado. `setSiDelSistema_` no es una mejora opcional: es la
> condición para poder eliminar el staging.

## Cuándo pinta `#4F81BD`

Un solo lugar en todo el repo: [línea 286](../Sinc%20Base%20usuario.js#L286),
inmediatamente después del `setValue`.

```js
rng.setValue(vPR);
rng.setBackground('#4F81BD'); // azul
```

Sólo en la rama **destino vacío ← PR con valor**, y sólo sobre el destino. Ni el relleno hacia
`Para Revisar` (línea 343) ni el paso 4 pintan nada — de ahí que el azul aparezca 3.779 veces
en `RVD JM-CM - ES` y cero veces en `Para Revisar`.

Tres condiciones tienen que darse para que pinte:

1. la celda del destino está vacía y la de PR tiene valor;
2. la columna **no** está en la blacklist de derivadas (ver abajo);
3. `rng.getFormula()` devuelve vacío.

### Qué significa y qué no significa el azul

El azul dice **"el sistema escribió acá al menos una vez"**. No dice "esta celda es del sistema
ahora". Nada lo despinta: si una persona corrige a mano un valor que el sistema había escrito,
la celda **queda azul** con contenido humano.

Esto es un límite real de `setSiDelSistema_(rango, valor)` tal como quedó definido en la sección
0: sobre una celda así, el helper va a considerar que puede escribir y va a pisar la corrección.
Hay tres salidas posibles, y la elección todavía no está tomada:

- convivir con el hueco y avisarle al equipo que corregir sobre azul no es estable;
- que el helper compare contra el último valor que el sistema escribió y no pise si cambió
  (requiere guardar ese valor en algún lado);
- un segundo color para "escrito por el sistema y corregido por una persona", pintado por el
  propio helper cuando detecta la divergencia.

`DIAG_PROCEDENCIA` mide el tamaño del problema antes de decidir.

## La blacklist de columnas derivadas

[líneas 43-54](../Sinc%20Base%20usuario.js#L43-L54). Diez nombres que el sync no completa nunca
en el destino:

```
Día de la semana · % de Asistencia · Falta Informacion · Comuna · Poblacion
p. Mujer · P. Varon · (km2) · (hab/km2) · Zona
```

**Son diez, y las columnas con fórmula de array son once.** Falta `Direccion2` (columna `X`).

El comentario del código sugiere que el `getFormula()` de la línea 266 cubre el resto, pero no
lo hace: en un bloque expandido por fórmula de array, la fórmula vive **sólo en la celda ancla**
(acá, el encabezado de la fila 1). `getFormula()` sobre `X500` devuelve cadena vacía, así que el
guard no dispara y el `setValue` de la línea 285 entra. Eso rompe el array completo de `X`
(`CLAUDE.md` 3.1.b).

Para que el bug se dispare tiene que existir una columna que normalice a `direccion2` en
`Para Revisar` **y** tener valor donde el destino no lo tiene. No puedo verificar desde el repo
si `Para Revisar` tiene esa columna — **hay que mirarlo en la planilla**. Si la tiene, es un
`#REF!` esperando su turno.

La lección para la Fase 3 es más general: **`getFormula()` no sirve para detectar celdas
protegidas por una fórmula de array.** El único guard confiable es la lista explícita de
nombres de columna.

## Resumen para la migración

| lo que hay que conservar | lo que hay que tirar |
|---|---|
| Escribir sólo sobre celda vacía | Que la protección dependa de que la celda esté vacía **y nada más** |
| Pintar `#4F81BD` en cada escritura del sistema | Que el azul sea sólo decorativo y nadie lo lea de vuelta |
| La blacklist explícita de columnas derivadas | Que tenga diez nombres en vez de once |
| Reportar las diferencias en vez de resolverlas | Que la fila que no matchea se descarte en silencio (regla 2) |
| — | La bidireccionalidad entera, con su regla numérica/no-numérica |
