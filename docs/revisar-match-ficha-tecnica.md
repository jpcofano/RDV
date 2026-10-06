# REVISAR_MATCH: ficha técnica para implementar en Apps Script

Diseño aprobado el 06/10/2026. Junto con este documento va `revisar_match_formato.gs`, que es la implementación de referencia: `renderRevisarMatch(pendientes, resueltas)` dibuja la solapa y `demoRevisarMatch()` pinta los 3 casos de ejemplo.

**Qué tiene que hacer Code:** integrar `revisar_match_formato.gs` al proyecto, armar los objetos `pendientes` y `resueltas` con los datos del sistema de match (la forma está en `demoRevisarMatch`) y usar el mapa que devuelve `renderRevisarMatch` para guardar las columnas auxiliares (de N en adelante, ocultas) y leer ELEGIR después.

---

## 1. Estructura

| Col | Encabezado | Ancho (px) | Quién escribe | Ajuste de texto | Alineación |
|---|---|---|---|---|---|
| A | ELEGIR ▾ | 100 | persona (desplegable) | recortar (CLIP) | izquierda |
| B | COMENTARIO | 140 | persona | ajustar (WRAP) | izquierda |
| C | resultado | 90 | sistema | WRAP | izquierda |
| D | tipo de línea | 76 | sistema | CLIP | izquierda |
| E | fila | 40 | sistema | CLIP (OVERFLOW en «¿por qué?» y «coincide») | centro (izquierda en esas dos líneas) |
| F | figura | 140 | sistema | WRAP | izquierda |
| G | fecha | 92 | sistema | CLIP | izquierda |
| H | barrio / comuna | 104 | sistema | WRAP | izquierda |
| I | formulario / tema | 240 | sistema | WRAP | izquierda |
| J | inscriptos | 56 | sistema | CLIP | centro |
| K | días | 40 | sistema | CLIP | centro |
| L | confianza | 64 | sistema | CLIP | centro |
| M | ya usado por | 112 | sistema | WRAP | izquierda |
| N… | auxiliares | — | sistema | — | **ocultas** |

Las 13 columnas suman **1294 px** y entran en una notebook de 1366 sin hacer zoom.

- **Congelado:** filas 1–2 (encabezado y aviso) y columnas A–B.
- **Cuadrícula:** oculta (`setHiddenGridlines(true)`). Todos los bordes son explícitos.
- **Fuente:** Arial en toda la hoja. Alineación vertical al medio en todas las celdas.
- **Formato numérico:** texto plano (`@`) en A..M, para que «+2» o «09/09/2026» no se conviertan.
- **Pestaña:** color #C2410C (opcional).
- Nada de celdas combinadas, imágenes ni botones.

## 2. Orden de las filas

```
1   Encabezado
2   Aviso: «↓ Elegí en la línea REUNIÓN» · PENDIENTES (n) · leyenda de colores · «No sé» la deja pendiente.
3   Separador (8 px)
    ── Ficha ──
    REUNIÓN                   ← única línea con ELEGIR (desplegable) y COMENTARIO
    ¿por qué?                 ← 1 o 2 líneas de texto
    Opción 1
    coincide                  ← «✅ figura · ❌ fecha (…) · ⚪ ubicación …»
    Opción 2 / coincide       (hasta 3 opciones)
    contexto                  (0 o más: otras reuniones cercanas de la misma figura)
    Separador entre fichas (14 px)
    ── … ──
    Separador (22 px)
    RESUELTAS (n)             ← encabezado de sección
    una línea por ficha resuelta, en tono apagado
```

En las fichas pendientes, A y B sólo tienen contenido en la línea REUNIÓN.

## 3. Tipos de línea

Tamaños en puntos (pt). «Bloque» quiere decir las columnas C..M; las celdas de elección son A..B.

| Tipo | Alto | Fondo | Texto | Tamaño | Peso / estilo | Notas |
|---|---|---|---|---|---|---|
| Encabezado A–B | 34 | #C2410C | #FFFFFF | 9 | negrita | WRAP |
| Encabezado C–M | 34 | #2E3B4E | #FFFFFF | 9 | negrita | WRAP |
| Aviso (fila 2) | 26 | #F1F3F5 | — | 10 | — | ver §3.1 |
| REUNIÓN A–B (elegir) | 30 | #FFE8CC | #7C2D12 | 10 | negrita | desplegable en A |
| REUNIÓN C–M | 30 | #DCE6F2 | #14243A | 11 | negrita | si no tiene barrio: H = «sin barrio», normal, itálica, #56657A |
| ¿por qué? C–M | 22 (1 línea) / 36 (2 líneas) | #F2F6FA | #26384D | 10 | itálica | D = «¿por qué?» negrita itálica #2E3B4E; texto en E con OVERFLOW |
| Opción C–M | 34 | #FFFFFF | #202124 | 10 | normal | D = «Opción N» negrita #2E3B4E; celdas coloreadas por coincidencia (§4) |
| coincide C–M | 22 | #FFFFFF | #5F6B7A | 9 | normal | D = «coincide», 8 pt, #9AA3AE; texto en E con OVERFLOW |
| contexto C–M | 22 | #FAFBFC | #8A94A2 | 9 | itálica | D = «contexto» |
| Separador | 8 / 14 / 22 | #FFFFFF | — | — | — | sin bordes |
| RESUELTAS (encabezado) A–M | 26 | #E9ECEF | #6B7785 | 10 | D negrita; F itálica | D = «RESUELTAS (n)», F = «lo que ya eligió una persona. Para anular: borrar su línea en ELECCIONES_MATCH.», ambas con OVERFLOW |
| Resuelta A–M | 22 | #F8F9FA | #9AA3AE | 9 | normal | sin desplegable |
| resultado (C) | — | (el de la línea) | aplicado: #1E6B34 · rechazado: #A50E0E (en RESUELTAS: #4F7A5A / #A0605A) | 9 | normal | |

A..B en las líneas que no son REUNIÓN: fondo blanco, vacías.

### 3.1 Fila 2 (aviso, congelada)

| Celda | Contenido | Formato |
|---|---|---|
| A2 | ↓ Elegí en la línea REUNIÓN | negrita, #C2410C, OVERFLOW sobre B2 |
| D2 | PENDIENTES (n) | negrita, #2E3B4E, OVERFLOW sobre E2 |
| F2 | ✅ coincide | fondo #CDEBD3, texto #14532D |
| G2 | ❌ no coincide | fondo #F6CFCB, texto #8B1A1A |
| H2 | ⚪ no se compara | fondo #ECEEF0, texto #5F6B7A |
| I2 | ⚠️ aviso (eje, ya usado, varias figuras) | fondo #FFEFA8, texto #5C4300 |
| J2 | «No sé» la deja pendiente. | 9 pt, #5F6B7A, OVERFLOW |

## 4. Colores de coincidencia (sólo en las líneas de opción)

| Estado | Fondo | Texto | Cuándo |
|---|---|---|---|
| verde, coincide | #CDEBD3 | #14532D | el dato coincide con la reunión |
| rojo, no coincide | #F6CFCB | #8B1A1A | el dato contradice a la reunión |
| gris, no se compara | #ECEEF0 | #5F6B7A | falta el dato de un lado (la reunión no tiene barrio, el formulario no nombra a nadie) |
| amarillo, aviso | #FFEFA8 | #5C4300 | no invalida la opción pero hay que mirarla |

Qué celda se colorea y con qué regla:

| Celda | Verde | Rojo | Gris | Amarillo |
|---|---|---|---|---|
| F figura | nombra sólo a la figura de la reunión | nombra a otra figura | no nombra a nadie | nombra a varias figuras, entre ellas la de la reunión |
| G fecha **y** K días (mismo color) | dentro del umbral del sistema (hoy ≤ 3 días) | fuera del umbral | sin fecha | — |
| H barrio / comuna | mismo barrio o comuna | otro barrio o comuna | falta de un lado | el formulario indica un eje que no coincide con la reunión |
| M ya usado por | — | — | — | si no está vacía |
| C, D, E, I, J, L | sin color (blanco) | | | |

El color nunca va solo: la línea «coincide» de abajo repite cada estado con su símbolo (✅ ❌ ⚪ ⚠️).

## 5. Bordes y separación

Se aplican en este orden, porque cada paso pisa al anterior:

1. **Toda la ficha, A..M:** borde fino (SOLID, 1 px) #E3E6EA en el contorno y en todas las divisiones internas.
2. **Líneas «¿por qué?» y «coincide», E..M:** se quitan las verticales internas, para que el texto desbordado no quede cortado por líneas.
3. **Línea REUNIÓN, C..M:** borde superior SOLID_MEDIUM (2 px) #2E3B4E. Es lo que marca el comienzo de cada ficha.
4. **Última línea de la ficha, C..M:** borde inferior SOLID (1 px) #AEB8C4.
5. **Celdas de elección (A..B en REUNIÓN):** SOLID_MEDIUM (2 px) #C2410C en los cuatro lados y entre A y B.
6. **RESUELTAS:** borde superior SOLID_MEDIUM #AEB8C4 en el encabezado (A..M), y bordes horizontales finos #E3E6EA entre las líneas resueltas.

**Separación entre fichas:** una fila vacía de 14 px, sin bordes y con fondo blanco. Hay 8 px entre el aviso y la primera ficha, y 22 px antes de RESUELTAS.

## 6. Desplegable de ELEGIR

- Va sólo en la columna A de cada línea REUNIÓN pendiente.
- Las opciones dependen de la ficha: «Opción 1»…«Opción N» (sólo las que existen), más «Ninguno» y «No sé».
- `requireValueInList(lista, true)`, con `setAllowInvalid(false)`.
- Texto de ayuda: «Elegí el formulario correcto para esta reunión. «No sé» la deja pendiente.»
- Las líneas de RESUELTAS no llevan desplegable: el valor elegido queda como texto apagado.

## 7. Reglas de contenido

- **¿por qué?:** el texto va en la columna E y desborda sobre F..M, así que esas celdas tienen que quedar **vacías** en esa línea, incluidas las auxiliares que estén en la misma fila. Si el texto pasa de 150 caracteres, se corta en dos con `\n`, buscando el último «, » o «. » antes del carácter 150 (si no hay, el último espacio). Esto lo hace `breakLine_()`.
- **coincide:** misma lógica, en una sola línea (≈ hasta 160 caracteres).
- **Fechas:** en REUNIÓN y contexto, «mié 09/09/2026»; en opción, «cierra 11/09».
- **días:** «+2», «-7», «0».
- **formulario:** se recorta el prefijo común y se marca con «…» al inicio (ej. «…Clara Muzzio 11/9 Recoleta - Temática»).
- **figura vacía en una opción:** «(sin figura)».
- **inscriptos desconocido en una opción:** «—».
- **contexto, columna M:** nota breve, por ejemplo «tiene la opción 1».

## 8. Lectura de la elección (contrato para el sistema)

- Se lee la columna A de las filas marcadas como `tipo: 'reunion'` en el mapa que devuelve `renderRevisarMatch`. «Opción N» corresponde a la fila con `tipo: 'opcion', opcion: N` de la misma ficha.
- Conviene guardar en las auxiliares ocultas (N+) una clave estable por línea (id de reunión y `form_clave` de cada opción), para no depender de la posición si la hoja se vuelve a dibujar.
- **Antes de redibujar, el sistema tiene que leer y conservar ELEGIR y COMENTARIO** de las fichas que siguen pendientes, porque `renderRevisarMatch` limpia A..M. Esos valores se pasan como `elegido` y `comentario` de cada ficha.
- El resultado («aplicado 05/10» o «rechazado: motivo») se escribe en C de la línea REUNIÓN. Cuando la ficha pasa a RESUELTAS, se escribe en C de su línea resuelta.

## 9. A verificar en la primera prueba

1. Que el «¿por qué?» de 2 líneas (con `\n` y OVERFLOW) se vea en dos renglones y desborde hacia la derecha. Si Sheets no lo muestra bien, la alternativa es WRAP en E con dos filas de texto, o acortar la frase.
2. Que los comentarios largos en B (más de ~40 caracteres) se ven recortados en la fila de 30 px, aunque el texto completo queda guardado. Si molesta, se puede subir el alto de la línea REUNIÓN.
3. Que el desplegable se vea como chip con flecha. Apps Script no permite elegir el estilo del desplegable: usa el que Sheets tenga por defecto.
