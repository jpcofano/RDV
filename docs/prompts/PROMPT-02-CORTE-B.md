# Prompt 02 — Corte B → B2

**Rama:** `migracion`
**Depende de:** `docs/prompts/PROMPT-CODE.md` (Fase 0 y 1)
**Estado:** ejecutado el 2026-09-23 — código escrito y verificado en banco de prueba; falta correrlo contra las planillas reales.

---

## Contexto

El diagnóstico de la Fase 1 corrió el 2026-09-22 y dio un resultado decisivo que cambia la
prioridad del plan:

```
Destino: 802 filas con datos (getLastRow=2374)
B2:      714 claves (14 duplicadas, 23 incompletas)
Para Revisar: 802 claves (0 duplicadas)

DIAG_HUECO — 79 filas analizadas
  no_existe_en_B2:            72  (91.1%)
  clave_incompleta:            7  ( 8.9%)
  B2_vacio_tambien:            0
  corte_B2_a_PR_flag_TRUE:     0
  corte_B2_a_PR_flag_FALSE:    0
  corte_PR_a_destino:          0

Inscriptos > 0 con las ocho columnas exactamente en cero: 1
```

**El staging no pierde datos.** Los pasos 4 y 5 funcionan: cero cortes. El corte está en
`B → B2` o antes. `Para Revisar` es un espejo del destino (802 claves, las mismas, cero
duplicadas) y por eso tampoco sirve como reservorio del backfill.

`diagFase1()` murió al final con `Service Spreadsheets timed out` accediendo a la intermedia
(`generarPisado_diag`). Se salvó `DIAG_HUECO` porque iba primero; se perdieron `DIAG_PISADO`,
`DIAG_ATOMICIDAD`, `DIAG_PROCEDENCIA` y `DIAG_TOTAL_DIVERGENTE`.

---

## 1. Arreglar el timeout

Separá cada reporte en su propio entry point ejecutable: `diagPisado()`, `diagAtomicidad()`,
`diagProcedencia()`, `diagTotalDivergente()`.

- Cada uno lee las solapas que necesita **una sola vez** a memoria y escribe **una sola vez**.
- Ninguno relee una solapa que ya leyó.
- `diagFase1()` queda como atajo que los llama en orden, pero cada uno tiene que poder
  correrse suelto desde el editor.

Motivo: con un único entry point, una caída al final tira todo el trabajo previo.

## 2. Actualizar `CLAUDE.md` con el resultado

**Sección 3.2:**
- De las 79 filas, 72 dan `no_existe_en_B2` y 7 `clave_incompleta`. Cero cortes en los pasos 4 y 5.
- El corte está en `B → B2` o antes, no en el staging.
- B2 tiene 714 claves contra 802 del destino: le faltan ~88, del orden de las 72.
- **14 claves duplicadas en B2** — evidencia directa del problema de la clave
  `nombre|inscriptos`, ya no es una preocupación teórica.

**Plan:**
- La Fase 5b baja de prioridad: sacar el staging es simplificación, no cura. Deja de bloquear.
- La decisión 10 (retiro de `Para Revisar`) queda **confirmada**, con la justificación del
  diagnóstico: es un espejo, no pierde datos y no sirve como reservorio. No hay que reabrirla,
  sólo respetar el orden **Fase 3 → `setSiDelSistema_` → Fase 5b**.

## 3. `diagnostico/02_corte_B_a_B2.js` — sólo lectura

Para las 72 filas de `DIAG_HUECO` con `no_existe_en_B2`, buscá la reunión en la solapa `B` de
la intermedia (el import crudo) y determiná por qué `syncB_to_B2` no generó fila.

Solapa de salida `DIAG_CORTE_B`, en la intermedia:

```
clave_destino | figura | barrio | fecha | encontrada_en_B | nombre_evento_en_B |
detectPersona_devuelve | detectBarrio_devuelve | detectFecha_devuelve | causa
```

Valores de `causa`:

| valor | significado |
|---|---|
| `no_esta_en_B` | no aparece en el import crudo |
| `persona_no_reconocida` | `detectPersona_` devuelve `''` — nombre fuera de la lista fija de 20 |
| `barrio_no_reconocido` | `detectBarrio_` devuelve `''` |
| `fecha_no_parseable` | `detectFecha_` devuelve `''` |
| `fecha_mal_parseada` | devuelve una fecha distinta de la del destino |
| `desaparecida_del_origen` | ver abajo |
| `deberia_haber_entrado` | los tres `detect*` devuelven valores correctos y aun así no está en B2 |

**Cómo matchear contra `B`:** no uses la clave del pipeline, que es justo lo que falla. Buscá
por fecha y por coincidencia parcial del nombre de la figura dentro del texto libre del evento.

**Usá copias de los `detect*` con sufijo `_diag2`,** no las del scope global. El objetivo es
medir lo que hace el código hoy, no una versión corregida.

Si alguna fila cae en `deberia_haber_entrado`, listala: es un caso que no entendemos.

### Sobre `desaparecida_del_origen`

La fila `clara muzzio|caballito|20260421` tiene el desagregado escrito, sin total y sin
contraparte en B2. Alguien lo escribió, así que en algún momento existió en B2 y después dejó
de estar.

`B` es un IMPORTRANGE de un rango vivo de `1W7mzk...`. Si el origen es una ventana móvil que
deja caer eventos viejos, las filas desaparecen de `B` y `syncB_to_B2` no las repone: B2 es un
espejo del import, no un acumulado.

Chequeá el rango de fechas de `B` contra el del destino (05/07/2025 → 24/09/2026) y reportalo.

**Si esto da positivo, el arreglo cambia de raíz:** no alcanza con ampliar las listas de
nombres y barrios, B2 tiene que pasar a ser acumulativo.

## 4. `DIAG_DUP_B2`

Listá las 14 claves duplicadas de B2 con las filas involucradas y el valor de `Inscriptos` de
cada una.

---

## Restricciones

- Todo sólo lectura. Ni un valor ni un fondo escritos en el destino.
- Las solapas de salida van en la intermedia (2), no en el destino.
- `clearContents()`, nunca `clear()`.
- Helpers propios con sufijo, sin colisionar con el scope global del legado (hay nueve copias
  de `toDate_` dando vueltas).
- `getValues()` en bloque, nunca `getValue()` por celda.
