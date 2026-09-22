# Backup previo a la migración (Fase 0)

**Nada de esto es opcional y nada de esto se hace después.** Las once fórmulas de array del
destino viven en la celda del encabezado y se expanden hacia abajo (CLAUDE.md 3.1.b): una vez
que se pisan, el texto original no se recupera desde la planilla — sólo desde esta copia.

Convención de nombres: sufijo `BACKUP AAAA-MM-DD` (fecha del día, no la del último cambio).
Carpeta sugerida en Drive: `RDV / _backups / AAAA-MM-DD`.

Fecha de ejecución de este checklist: `____________`
Responsable: `____________`

---

## 1. Copias completas de las planillas propias

- [ ] **(1) Destino final** — `RDV JM-CM - ES / funcionarios`
      (`1ZpHO6Ru1uY2r9WfBF_yFtu5z7ip7F3Q6VOoRJN5vLAo`)
      → Archivo → Hacer una copia → `RDV JM-CM - ES BACKUP AAAA-MM-DD`
      **Copiar también los comentarios** (tildar la opción en el diálogo).
- [ ] **(2) Base intermedia** — `Base intermedia Reuniones de Vecinos`
      (`1dNLcBjh1ncEVBeALD-szhIlcRGkfOiMaPJp2tGqrsyM`)
      → `Base intermedia RDV BACKUP AAAA-MM-DD`
      Ojo: el proyecto de Apps Script está atado a esta planilla (`getActive()`). La copia
      **se lleva una copia del código** y, con ella, cualquier activador que se dispare desde
      ahí. Revisar la copia y borrarle los activadores para que no corra en paralelo.
- [ ] **(4) Agenda** (`1hP8zMN8Ep7s1w9zb3Fllix2q_OqIhVwkrED0KCoVh4U`)
      → `Agenda RDV BACKUP AAAA-MM-DD`. El flujo Agenda funciona y no se toca, pero comparte
      destino con el pipeline.
- [ ] **(3) Origen inscriptos** (`1W7mzk...`) — **no somos dueños, no se copia ni se toca.**
      Si hace falta congelar su contenido, se exporta a XLSX y se guarda **fuera del repo**
      (ver sección 5).

## 2. Las once fórmulas de array del destino

Solapa `RVD JM-CM - ES`. Cada una vive en la **celda del encabezado** (fila 1) y se expande
hacia abajo hasta la fila 2374. Hay que guardar el **texto literal** de cada una, no el
resultado.

Cómo: pararse en la celda, copiar el contenido de la barra de fórmulas, pegarlo en
`docs/formulas-legado.md` (crear el archivo en esta misma rama).

- [ ] `D1` — Día de la semana
- [ ] `W1` — % de Asistencia
- [ ] `X1` — Direccion2
- [ ] `Y1` — Falta Informacion
- [ ] `AA1` — Comuna
- [ ] `AB1` — Poblacion
- [ ] `AC1` — p. Mujer
- [ ] `AD1` — P. Varon
- [ ] `AE1` — (km2)
- [ ] `AF1` — (hab/km2)
- [ ] `AG1` — Zona
- [ ] Verificar que no quedó ninguna otra columna con fórmula: seleccionar la fila 1 completa
      y recorrerla, o `Ver → Mostrar → Fórmulas` (Ctrl+`) y sacar una captura.

## 3. Foto de la tabla de lookup

- [ ] Solapa `Comunas` (A:H) del destino → copiar a una solapa nueva `Comunas BACKUP AAAA-MM-DD`
      **pegando sólo valores**. Es la fuente de las siete columnas `AA`–`AG`; si cambia después,
      la comparación de la Fase 3 deja de ser válida.

## 4. Números de control (para poder verificar después)

Anotar el valor de hoy. La Fase 3 exige que estos números no cambien, y la Fase 6 se mide
contra ellos.

| métrica | valor esperado (auditoría 2026-09) | valor medido hoy |
|---|---|---|
| filas con datos en `RVD JM-CM - ES` | 802 | |
| clave natural `Figura\|Barrio\|Fecha` completa | 793 | |
| claves naturales duplicadas | 0 | |
| filas sin `Inscriptos` | 17 | |
| filas con `Inscriptos` y sin sexo/edades | 79 | |
| rango de fechas | 05/07/2025 → 24/09/2026 | |
| última fila alcanzada por las fórmulas | 2374 | |

- [ ] Correr `diagnostico/01_hueco_sexo_edades.js` **antes** de tocar nada y guardar las
      solapas `DIAG_HUECO` y `DIAG_PISADO` que genera. Son sólo lectura y son la línea de base.

## 5. Código y estado del proyecto de Apps Script

- [ ] `clasp pull` en la rama `migracion` y confirmar que no hay diferencias con lo que está
      commiteado. Si aparecen archivos nuevos, hay código en el editor que nunca llegó al repo.
- [ ] Tag de git en el estado previo: `git tag backup-pre-migracion-AAAA-MM-DD && git push --tags`
- [ ] Captura de pantalla de la lista de archivos del editor **en orden**. El orden de carga
      decide qué copia de `toDate_` gana (CLAUDE.md 3.1.c) y no está en el repo.
- [ ] `docs/triggers-legado.md` completo. Sin eso no se sabe qué hay que apagar en la Fase 7.

## 6. Reglas

- **Nada de datos reales en el repo.** Es público. Los XLSX y las copias van a Drive, nunca a
  git. `.gitignore` bloquea `*.xlsx` / `*.xls`.
- Las copias de backup **no se editan nunca**. Si hace falta probar algo sobre datos reales,
  se hace una tercera copia de trabajo.
- Antes de borrar una fórmula del destino: la Fase 3 exige correr `recalcDerivadas_()` sobre
  una copia y comparar columna por columna contra el original en las 802 filas. Recién con esa
  comparación en verde se toca el original.

## 7. Cómo volver atrás

1. Abrir la copia `BACKUP AAAA-MM-DD` de la planilla afectada.
2. Si lo roto son las fórmulas: pegar el texto guardado en `docs/formulas-legado.md` en la
   celda del encabezado correspondiente. Verificar que se expande y que no tira
   `#REF!` (si tira, hay datos escritos abajo que hay que limpiar primero).
3. Si lo roto son los datos: copiar la solapa entera desde el backup, pegar sólo valores.
4. Si lo roto es el código: `git checkout main` + `clasp push --force`.
5. En todos los casos: **apagar los activadores antes de restaurar**, para que no vuelva a
   correr sobre la planilla a medio arreglar.
