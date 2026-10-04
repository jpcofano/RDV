# Cómo elegir un match a mano

Para quien revisa las reuniones que el sistema no pudo emparejar solo.

## Qué es esto

Cada hora, el sistema empareja cada reunión de **RVD JM-CM - ES** con su formulario de inscripción y
completa los datos (inscriptos, canales, sexo, edades, asistentes). Cuando no está seguro de cuál es el
formulario de una reunión, **no escribe nada** y te la muestra en una **ficha** para que elijas vos. Lo
que elijas se escribe en la corrida siguiente.

Sólo se miran las reuniones de **los últimos 30 días**. Las más viejas ya están cerradas: no aparecen y
el sistema no las toca.

Las fichas están en la **Base intermedia de Reuniones de Vecinos**, solapa **REVISAR_MATCH**, de la
reunión más reciente a la más vieja.

## Cómo se lee una ficha

| línea | qué tiene |
|---|---|
| **REUNIÓN** (en negrita, fondo lila) | la reunión: fila del destino, figura, fecha, barrio y comuna, evento, inscriptos y asistentes cargados. Acá elegís |
| **¿por qué?** | en una frase, por qué el sistema no decidió solo. Habla de la opción 1 |
| **Opción 1, 2, 3** | los formularios candidatos, de la que más coincide a la que menos, en las mismas columnas que la reunión. La columna **confianza** dice cuánto coincide: *alta*, *media* o *baja* |
| debajo de cada opción | qué coincide y qué no: ✅ coincide · ❌ no coincide · ⚪ no se puede comparar · ⚠️ ojo |
| **otra reunión** (en gris) | otras reuniones de la misma figura a 7 días o menos, para tener contexto |
| **formulario descartado** (en gris) | un formulario de la misma figura que el sistema no tiene en cuenta porque casi no tiene inscriptos y tiene un gemelo con el mismo nombre que sí |

En las opciones, cada celda tiene color:

- **verde**: coincide con la reunión (la figura, la fecha o la ubicación);
- **rojo**: no coincide, o el formulario ya lo tiene otra reunión ("ocupado por");
- **gris**: no se puede comparar (por ejemplo, el formulario no dice el barrio);
- **amarillo**: el formulario dice un eje (Norte, Sur, …) distinto del eje del barrio de la reunión. Es
  sólo un aviso para vos: el sistema no lo usa para decidir.

Los inscriptos de una opción son **los del formulario**. Los de la línea REUNIÓN son los que ya están
cargados: sirven para que compares, pero el sistema no los usa para decidir.

## Qué elegir en "elegido"

En la línea **REUNIÓN**, la columna **elegido** tiene un desplegable:

| elegís | significa |
|---|---|
| **Opción 1**, **2** o **3** | la reunión es la de esa opción |
| **Ninguno** | ninguna opción es esta reunión |
| **No sé** | todavía no sabés: la ficha queda pendiente y no bloquea nada |

En **comentario** podés escribir lo que quieras (por ejemplo, a quién le preguntaste). Se guarda.

Si cambiás de idea antes de que se aplique, elegí otra cosa en el desplegable: vale lo último que elegiste.

## Qué significa "resultado"

Lo escribe el sistema:

- **válida (en seco: …)**: la elección está bien y se va a escribir en la próxima corrida.
- **aplicado `<fecha>`**: ya se escribió.
- **rechazado: `<motivo>`**: no se escribió nada. Los motivos:
  - *el formulario ya tiene otra fila*: ese formulario (o uno igual con el mismo nombre) ya es de otra
    reunión. Si creés que está mal la otra, avisá: no se corrige solo;
  - *el formulario ya no existe en B*: lo sacaron del origen o le cambiaron el nombre;
  - *dos elecciones para la misma fila* / *para el mismo formulario*: hay que dejar una sola;
  - *la fila ya está escrita*: la reunión ya tenía datos del sistema.
- **ninguno: no se vuelve a proponer**: la ficha deja de aparecer. Vuelve sola si llega un formulario
  nuevo de esa figura a 7 días o menos de la fecha.

Las fichas que ya resolviste (aplicadas, válidas o "ninguno") pasan a la sección **RESUELTAS**, al
final de la solapa, con su resultado y su fecha.

## Lo que el sistema nunca hace

- **No pisa nada**: escribe sólo en celdas vacías. Si alguien ya cargó un número, queda.
- **No toca el Barrio**: lo carga el equipo.
- **No toca las reuniones de hace más de 30 días.**
- Lo que escribe queda pintado de **azul claro**, para que se vea qué puso el sistema.

## Si te equivocaste

Mientras diga "válida", todavía no se escribió: cambiá la elección en el desplegable, o avisá. Si ya
dice "aplicado", hay que deshacerlo a mano en la reunión: avisá.
