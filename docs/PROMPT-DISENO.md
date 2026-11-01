# Prompt de diseño — Gramola (tele + móvil)

> Pegar todo lo que hay debajo de la línea en la herramienta de diseño (Claude Design, Stitch…).

---

Diseña la interfaz COMPLETA y todos los recursos gráficos de **Gramola**, un juego de karaoke para fiestas entre amigos. Se juega en la tele y los **móviles de los jugadores hacen de micrófono**: cada uno escanea un QR, entra en una web y el móvil detecta el tono de su voz. El juego puntúa lo afinado que canta cada uno. Es una app personal, en **castellano**, con la firma **© NUVOLACAT** en el pie de las pantallas de inicio.

Quiero una identidad visual **original y propia**. Puede seguir las convenciones conocidas del género de karaoke (barras de notas, letra iluminándose, puntuación por frase, rangos), pero **sin imitar a ningún juego existente**: nada de logotipos, iconos, personajes, tipografías, colores corporativos ni pantallas reconocibles de otros productos, y sin marcas de terceros. No uses fotos de artistas reales ni portadas de discos reales: las portadas de ejemplo deben ser inventadas, con títulos y artistas ficticios.

## 1. Plataforma y restricciones técnicas

- **Dónde se juega**: la pantalla de la tele funciona en **cualquier navegador** (smart TV, portátil conectado a la tele, PC). Se escala manteniendo el 16:9 con bandas negras si hace falta.
- **Tele**: lienzo de **1920×1080** px. Diseño para verlo a 3 metros desde el sofá (interfaz de "10 pies"): texto mínimo de 28 px, letra cantable de 64 a 80 px, contraste alto y zona segura del 5 % en los bordes (nada importante fuera de 96 px horizontales y 54 px verticales).
- **Control con mando** (cruceta, OK, Volver y Pausa) o con los botones del móvil. **No hay ratón ni pantalla táctil en la tele**: cada elemento seleccionable necesita un **estado de foco** muy visible (anillo luminoso, escala 1,05 y brillo) y un orden de navegación evidente.
- **Ayudas de botones** en la esquina inferior derecha, con glifos **genéricos y propios** (círculo con "OK", flecha de volver, cruceta), nunca los botones oficiales de ningún mando.
- La interfaz se programará **dibujada en un canvas**. Usa formas que se puedan dibujar: rectángulos redondeados, círculos, degradados lineales y radiales, brillos (glow), trazos, imágenes y texto. Evita el desenfoque de fondo pesado (glassmorphism con blur real), las máscaras complejas y las sombras múltiples apiladas. Si lo usas como efecto, indica una alternativa barata (panel semitransparente).
- **Móvil**: frames de **390×844** (iPhone) con zonas seguras (notch y barra inferior). Una sola columna, botones grandes para el pulgar, pensado para usarlo de pie en una fiesta y con poca luz.

## 2. Identidad visual

- **Concepto**: "noche de fiesta en casa". Ambiente nocturno y cálido, luces de neón suaves, alegre y nada infantil. Que dé ganas de cantar.
- **Paleta base** (propón la tuya si mejora esto):
  - Fondo noche `#0D0820`, morado profundo `#2A1460`, azul noche `#0B3A5C`
  - Texto `#F5F0FF`, texto secundario `#A99CC9`, texto apagado `#5F5388`
  - Acento principal (rosa neón) `#FF4FA3`, dorado para notas doradas y récords `#FFD23F`
  - **8 colores de jugador**, muy distinguibles entre sí y con daltonismo en mente: `#FF4FA3`, `#3FD0FF`, `#FFD23F`, `#7CFF6B`, `#B38CFF`, `#FF8A3D`, `#4FFFD8`, `#FF5A5A`. Cada jugador lleva además una **forma** (círculo, triángulo, cuadrado, rombo, estrella, hexágono, corazón, rayo) para no depender solo del color.
- **Tipografía**: redondeada, gruesa y muy legible a distancia, de Google Fonts (propuesta: **Baloo 2**, pesos 500/700/800). Escala para la tele: 150 / 96 / 72 / 56 / 44 / 36 / 28.
- **Formas**: esquinas muy redondeadas (24–40 px en paneles, cápsulas en botones), paneles oscuros semitransparentes sobre el fondo y brillo de color en lo activo.
- **Fondo animado** por defecto: manchas de luz de colores que se mueven muy despacio, más una capa sutil de partículas o "confeti de luz". En las canciones con vídeo o imagen propia, ese fondo se oscurece al 55 %.
- **Logotipo** de **Gramola**: wordmark con un símbolo propio que juegue con la idea del nombre, una **caja que suena**. Por ejemplo, una caja o cubo redondeado del que salen ondas de voz o notas, o una caja con forma de altavoz y una onda que la atraviesa, todo original. El wordmark puede destacar "Box" con el rosa neón. Versiones horizontal, apilada y solo símbolo, sobre oscuro y sobre claro, y versión monocroma.

## 3. Pantallas de la TELE (un frame de 1920×1080 cada una, con estados)

1. **Arranque**: logo animado sobre el fondo, con indicación de "Conectando…".
2. **Sala / Lobby**: título y lema ("Tu móvil es el micro"), los 3 pasos numerados (escanea el QR, pon tu nombre y activa el micro, pulsa OK), un **QR grande** en una tarjeta clara, el **código de sala** de 4 letras gigante y la URL corta. Abajo, la fila de **jugadores conectados** (fichas con su color, forma y nombre; desconectado = 40 % de opacidad). Animación de entrada al unirse alguien. Estados: sin nadie, con 1, con 4 y con 8 jugadores.
3. **Menú principal** (tarjetas grandes con ilustración propia):
   - **Cantar**: solo o todos a la vez.
   - **Duelo**: dos jugadores (o dos equipos) cara a cara.
   - **Dúo**: canciones a dos voces, cada uno su parte.
   - **Pasa el micro**: modo fiesta por equipos con retos.
   - **Jukebox**: la canción con letra y sin puntuación, para cantar todos.
   - **Récords**, **Ajustes**.
4. **Selección de canción**: carrusel horizontal de portadas (la enfocada grande y brillante, las laterales pequeñas y atenuadas), con título, artista, duración, año, idioma, dificultad (1–3 notas), insignia "Dúo" y el récord actual con el nombre de quien lo tiene. Barra de **filtros/orden** (A–Z, artista, década, género, idioma, solo dúos, más cantadas) y **búsqueda** con teclado en pantalla adaptado al mando. Indicador "sonando avance". Estados: lista normal, filtrando y lista vacía ("Aún no hay canciones").
5. **Preparar partida**: quién canta (fichas de jugadores conectados para activar o desactivar), dificultad por jugador (Fácil / Normal / Difícil, explicando el margen de afinación), en Dúo quién canta cada parte y en Duelo quién va con quién. Botón "¡A cantar!".
6. **Carga y cuenta atrás**: portada, título y "3, 2, 1" gigante y animado, con consejos rotativos.
7. **Canto, 1 jugador** (la pantalla más importante; quiero ver todos sus elementos al detalle):
   - Arriba a la izquierda, título y artista. Arriba a la derecha, el **marcador** del jugador (nombre, color, puntos con animación al subir).
   - **Carril de notas** (franja central, unos 520 px de alto) sobre un panel oscuro: barras de nota que entran por la derecha y pasan por una **línea de lectura** vertical situada al 27 % del ancho. La altura de cada barra indica el tono y su longitud, la duración.
   - Tipos de nota: **normal** (cápsula translúcida con borde claro), **dorada** (dorada con brillo y destellos, puntúa doble), **libre** (contorno discontinuo, no puntúa) y **rap** (patrón de rayas).
   - **Estela de la voz**: línea luminosa del color del jugador que dibuja el tono cantado. Cuando acierta, la barra se **rellena** de su color con un pequeño destello de partículas; cuando falla, la estela va por encima o por debajo de la barra.
   - Un **indicador** en la línea de lectura que muestra dónde está la voz ahora (punto brillante, más grande al acertar).
   - **Letra** en un panel inferior: frase actual grande, con la sílaba que se canta rellenándose de izquierda a derecha en rosa (o dorado si la nota es dorada), y la siguiente frase más pequeña y atenuada debajo.
   - **Valoración por frase** que aparece junto al marcador: "¡Perfecto!", "¡Genial!", "¡Bien!", "Regular" y "Fallo", cada una con su color e intensidad.
   - **Racha/combo** de notas acertadas seguidas. Barra fina de **progreso** de la canción abajo del todo. **Cuenta atrás** antes de la primera frase. Pista visual de "Interludio musical" en las pausas largas.
8. **Canto, 2 a 8 jugadores con la misma parte**: un único carril, y cada barra se rellena por **franjas horizontales**, una por jugador. Estelas de varios colores. Fila de marcadores arriba (de 2 a 8 fichas que se adaptan de ancho). Muestra los casos de 2 y de 6 jugadores.
9. **Canto en Dúo**: **dos carriles** (parte 1 arriba, parte 2 abajo), cada uno con su letra y su color, y una marca de "cantad juntos" cuando coinciden.
10. **Canto en Duelo**: carril compartido y **barra de "tira y afloja"** arriba, que se inclina hacia quien va ganando, con marcadores enfrentados y animación cuando se adelanta uno.
11. **Pausa**: oscurecido sobre el canto, con las opciones Seguir, Reiniciar canción, Ajustes de audio y Salir.
12. **Resultados**: podio o lista con la puntuación de cada jugador **contando desde cero**, su **rango** con insignia, estadísticas (precisión %, notas doradas acertadas, mejor racha, mejor frase), etiqueta de **"¡Nuevo récord!"** con confeti, y los botones Otra canción, Repetir y Menú. Estados: 1 jugador, 4 jugadores y empate.
13. **Rangos** (6 insignias propias con ilustración y color): "Cantante de ducha", "Aficionado", "Promesa", "Estrella", "Leyenda" y "Mito".
14. **Pasa el micro (modo fiesta)**:
    - Formación de **equipos** (2 a 4, con nombre y color de equipo; se arrastran jugadores con el mando).
    - **Ruleta de retos** con tarjetas: "Solo el estribillo", "Sin ver la letra", "Canta más agudo", "A dúo con el rival", "El que más aguante una nota"…
    - Pantalla de **turno**: "Le toca a: [nombre] del equipo [X]", a pantalla completa.
    - **Marcador de equipos** entre rondas y **pantalla final** de campeones.
15. **Jukebox**: letra protagonista centrada, muy grande, sin puntuación, con el vídeo o fondo de la canción y una cola de próximas canciones a un lado.
16. **Récords / Salón de la fama**: mejor puntuación por canción, los cantantes con más canciones y las rachas más largas.
17. **Ajustes**: dificultad por defecto, **calibración del retraso** del micro, volumen de música y de efectos, mostrar u ocultar la estela, tamaño de la letra, idioma (Castellano / Català) y gestión de la sala (expulsar jugador, nuevo código).
18. **Calibración del retraso**: el juego emite pitidos al ritmo, el jugador canta "pa" con cada uno y se muestra el retraso medido en ms, con un ajuste manual (deslizador) y una prueba.
19. **Estados de error y avisos**: sin conexión con el servidor, micro de un jugador desconectado (ficha atenuada con icono), la tele ha perdido la sala (reconectando), canción que no se puede cargar y sala llena. Además, **avisos tipo "toast"** en la parte inferior ("Marta se ha unido", "Pedro se ha desconectado").

## 4. Pantallas del MÓVIL (frames de 390×844)

1. **Unirse**: logo pequeño, una frase ("Tu móvil es el micro"), campo **nombre**, campo **código de sala** (4 letras grandes y espaciadas, rellenado solo si se viene del QR) y el botón grande "Entrar y activar el micro". Estado de error en línea.
2. **Permiso del micro**: explicación amable de por qué se pide, más una ayuda para cuando está denegado en iPhone (pasos para reactivarlo en Safari).
3. **Micro activo, en espera**: cabecera con el color, la forma y el nombre del jugador, estado de conexión y "Elige canción en la tele".
4. **Micro activo, cantando**: frase actual y siguiente, un **anillo/vúmetro** que late con la voz y la **nota detectada** grande en el centro (Do, Re#…), puntos en vivo y un aviso "Acerca el móvil a la boca" si el volumen es bajo. Toda la pantalla del color del jugador, con poca luz para no deslumbrar.
5. **Mando**: cruceta, OK y Volver grandes para manejar los menús de la tele desde el móvil (con vibración al pulsar).
6. **Resultados en el móvil**: tus puntos, tu rango y tu posición.
7. **Elegir equipo o parte** (Pasa el micro y Dúo).
8. **Desconectado/reconectando** y **sala cerrada**.

## 5. Componentes (hoja de componentes)

Entrega una hoja con todos los componentes y sus estados (normal, foco, pulsado, desactivado): botones en cápsula, tarjetas de modo, ficha de jugador (8 colores × 8 formas), marcador, portada (con imagen y la **portada generada** cuando no hay imagen: degradado con las iniciales), barras de nota (4 tipos × vacía, a medias y llena × 1, 2 y 4 jugadores), estela de voz, línea de lectura, etiquetas de valoración, insignias de rango, toast, ayudas de botones, teclado en pantalla, deslizador, interruptor, barra de progreso, barra de duelo, cuenta atrás, QR en su tarjeta y código de sala.

## 6. Recursos gráficos que hay que generar (imágenes finales)

Entrega cada uno como imagen independiente (PNG con transparencia salvo los fondos):

- **Logo** de Gramola: horizontal, apilado y símbolo; versiones para fondo oscuro y claro; 4096 px de ancho máximo.
- **Iconos de la app** (símbolo sobre el fondo de marca): 44×44, 50×50, 150×150, 310×310, ancho 310×150 y pantalla de arranque 620×300 y 1920×1080.
- **Favicon y icono de la web del móvil**: 32, 180 (Apple touch) y 512.
- **Fondos**: el fondo nocturno por defecto (1920×1080, con capas separadas: manchas de luz, partículas y viñeta, para animarlas), más una variante por modo (Duelo, Dúo, Pasa el micro, Jukebox).
- **Ilustraciones de las tarjetas del menú** (una por modo, 600×400, estilo coherente: ilustración plana con brillos de neón y personajes y objetos originales).
- **6 insignias de rango** (512×512).
- **8 formas de jugador** (128×128, en blanco para teñirlas por código).
- **Sprites de efectos**: destello de acierto, partículas de nota dorada, confeti de récord y explosión de "¡Perfecto!" (hojas de sprites o piezas sueltas de 256×256).
- **Glifos de ayudas de botones** propios: OK, Volver, Menú, cruceta y las 4 direcciones (64×64).
- **6 portadas de ejemplo** de canciones ficticias (1000×1000) para las maquetas, más el diseño de la **portada generada** por defecto.
- **Tarjetas de reto** de Pasa el micro (8 retos, 600×800).
- **Imagen para compartir** (OG) de la web del móvil: 1200×630.

## 7. Movimiento (describir, aunque las maquetas sean estáticas)

Para cada pantalla, indica brevemente las animaciones con su duración y curva: entrada del carrusel, cambio de foco (150 ms, ease-out), aparición de las valoraciones (sube y se desvanece en 1,4 s), puntos que cuentan hacia arriba, relleno de las barras, cuenta atrás con rebote, confeti de récord, transición entre pantallas (fundido con deslizamiento, 250 ms) y el latido del anillo del móvil con la voz.

## 8. Entregables

1. Un **frame por pantalla y por estado** de la lista anterior (tele a 1920×1080, móvil a 390×844), nombrados con número y nombre (`TV-07 Canto 1 jugador`, `MOV-04 Cantando`…).
2. La **hoja de componentes** con sus estados.
3. Los **tokens de diseño**: colores (con nombre y hex), escala tipográfica, espaciados (base de 8 px), radios, sombras y brillos, y duraciones de animación.
4. **Todos los recursos gráficos** del apartado 6, exportados.
5. Un **mapa de navegación** (qué botón lleva a qué pantalla) para el mando y para el móvil.

Usa textos reales en castellano en todas las pantallas (nada de lorem ipsum), con canciones, artistas y letras **inventados**.
