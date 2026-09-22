# Prompt para Claude Code

Pegá esto en Claude Code, parado en la carpeta del repo, con `CLAUDE.md` ya commiteado.

---

Leé `CLAUDE.md` entero antes de escribir una línea. Es una auditoría real de este repo,
con números medidos, no un brief genérico.

Trabajamos sobre un proyecto de Google Apps Script que consolida datos de Reuniones de
Vecinos. El código actual está en `main` y tiene problemas serios documentados en la
sección 3. Vamos a migrarlo por fases.

**Arrancá por la Fase 0 y la Fase 1. Nada más.** No escribas el código de las fases
siguientes hasta que yo confirme los resultados del diagnóstico.

## Fase 0

1. Creá la rama `migracion`.
2. Creá `docs/triggers-legado.md` con una tabla vacía (función, tipo, frecuencia, dueño,
   última modificación) y una nota de que la lleno yo a mano desde el editor de Apps Script.
3. Creá `docs/backup.md` con el checklist de qué copiar antes de tocar fórmulas.

## Fase 1 — Diagnóstico del hueco de sexo/edades

Escribí `diagnostico/01_hueco_sexo_edades.js`, una función de **sólo lectura** que:

- Lee `RVD JM-CM - ES` del spreadsheet `1ZpHO6...`
- Identifica las filas con `Inscriptos` cargado pero `Masculinos`/`Femeninos` y los seis
  rangos etarios vacíos. Deberían ser ~79 (ver tabla en CLAUDE.md 3.2).
- Para cada una, busca la fila correspondiente en `B2` de `1dNLcBjh...` usando la clave
  natural `normalizeText_(Figura)|normalizeText_(BarrioN)|yyyyMMdd(Fecha)`
- Escribe el resultado en una solapa nueva `DIAG_HUECO` con estas columnas:

  `Figura | Barrio | Fecha | clave_calculada | existe_en_B2 | B2_tiene_sexo |
   B2_tiene_edades | B2_Procesado_BF | diagnostico`

  donde `diagnostico` es uno de: `no_existe_en_B2`, `B2_vacio_tambien`,
  `B2_tiene_datos_flag_TRUE`, `B2_tiene_datos_flag_FALSE`, `clave_incompleta`.

**Restricciones para esta función:**

- No escribe en ninguna columna existente. Sólo crea `DIAG_HUECO`.
- No toca las columnas con fórmulas de array (`D`, `W`, `X`, `Y`, `AA`–`AG`). Ver CLAUDE.md 3.1.b:
  escribir ahí rompe el bloque entero.
- Usa `getValues()` en bloque, no `getValue()` por celda. Son ~800 filas y Apps Script corta a
  los 6 minutos.
- Define sus propios helpers con sufijo `_diag` para no colisionar con las nueve copias de
  `toDate_` que ya viven en el scope global. Ver CLAUDE.md 3.1.c.

Al terminar, mostrame el conteo por valor de `diagnostico` en el log.

### Segunda parte de la Fase 1

Las columnas de canales (`Mail`, `Call Center`, `IVR`, `RRSS`, `Difusión`) las carga el equipo a
mano, pero el upsert legado las escribe sin condición. Agregá a `DIAG_HUECO` una segunda solapa
`DIAG_PISADO` que, para todas las filas del destino (no sólo las 79), compare el valor actual de
esas cinco columnas contra el que traería B2. Columnas:

`Figura | Barrio | Fecha | columna | valor_destino | valor_B2 | coincide`

Me interesa cuántas filas tienen un valor cargado a mano que B2 pisaría con algo distinto —
sobre todo con cero. Es sólo lectura, no escribas nada en esas columnas.

## Cómo quiero que trabajes

- Preguntá antes de asumir. Si algo de `CLAUDE.md` no cierra con lo que ves en el código,
  decímelo en vez de resolverlo por tu cuenta.
- No refactorices nada fuera de lo pedido. Hay 676 líneas de código muerto y nueve copias
  de cada helper: sé que están, se limpian en la Fase 2.
- Un commit por entregable, mensaje en español.
- Todo el código y los comentarios en español.
