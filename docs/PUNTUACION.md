# Puntuación

Es la del diseño, alimentada con la voz real.

## Detección de tono (móvil)

- Micro sin cancelación de eco, supresión de ruido ni control de ganancia.
- YIN sobre 2.048 muestras cada 40 ms (70–1.100 Hz), suelo de ruido adaptativo, claridad mínima 0,8 y mediana de 3.
- Se envía la nota MIDI decimal, el volumen y la latencia estimada.

## En la tele

- Cada nota se divide en **ranuras de 40 ms**. Una ranura cuenta si en ella la voz está dentro del margen:
  - **Fácil ±4**, **Normal ±2**, **Difícil ±1** semitonos (por jugador, al preparar la partida; desde el 01-nov el
    listón es la mitad de exigente que el del diseño original). Rap: +0,6.
  - La voz cuenta aunque llegue hasta 70 ms antes o después de la nota; con dos notas pegadas, manda la nota que
    contiene el instante de verdad (el margen de la anterior no le roba la primera ranura a la siguiente).
  - **Octava indiferente**: se compara la nota, no lo grave o agudo.
- **Puntos**: 10.000 repartidos entre todas las ranuras de la parte del cantante; las notas **doradas** valen el doble.
- **Racha**: notas seguidas con más del 60 % acertado. **Dorada acertada**: más del 60 %.
- **Valoración de frase**: > 90 % *Perfecto*, > 75 % *Genial*, > 55 % *Bien*, > 30 % *Regular*, si no *Fallo*.
- **Duelo**: media por equipo y barra de tira y afloja; aviso «Se adelanta…».
- **Retraso**: la muestra se coloca en `reloj − (ajuste del micro + latencia del móvil + latencia de la tele)`;
  el ajuste se mide en **Ajustes → Retraso del micro** cantando «pa» con 8 pitidos.

## En el servidor (los récords no se los inventa nadie)

La tele puntúa y dibuja en directo, sin esperar a la red. Pero el récord que se guarda lo comprueba el servidor
(`server/puntuacion.js`), que ve pasar la misma voz que reenvía a la tele:

- Al empezar la canción la tele manda `sing` (canción, modo Dúo, ajuste del micro y, por cantante, parte y margen) y
  cada segundo `clock` (en qué segundo va la canción y si está en marcha). El servidor lee la misma partitura con el
  mismo lector que la tele (`web/js/ultrastar.js`) y aplica la misma regla: ranuras de 40 ms, octava indiferente,
  margen por cantante (+0,6 en rap), doradas al doble, lecturas del móvil válidas hasta 160 ms, cada muestra colocada
  en `reloj − (ajuste + latencia del móvil + latencia de la tele)`.
- Al acabar, la tele envía los puntos que ha mostrado. El servidor solo guarda jugadores que están en la sala (con el
  nombre que dieron al entrar, nunca el que diga la tele), descarta a los bots y a quien no ha cantado nada, y recorta
  los puntos a **lo visto × 1,25 + 200** (el margen cubre el vibrato, que solo puntúa la tele, y los pequeños desfases
  de reloj) y la racha a **la vista + 3**. Si la canción no ha llegado al final o ya se guardó, no se guarda nada.
- En el admin (Actividad) se ve cuándo la tele decía más de lo que se guardó.

Con esto, un récord exige haber mandado al servidor una voz que acierte las notas durante toda la canción, no basta
con una petición.

## Rangos

| Puntos | Rango |
|---|---|
| menos de 3.000 | Cantante de ducha |
| 3.000 – 4.999 | Aficionado |
| 5.000 – 6.499 | Promesa |
| 6.500 – 7.999 | Estrella |
| 8.000 – 9.199 | Leyenda |
| 9.200 o más | Mito |

## Vibrato

En las notas de 0,8 s o más, la tele guarda las lecturas de tono que llegan del móvil (unas 25 por segundo) y busca
una oscilación regular alrededor de la nota: entre 4 y 8,5 vaivenes por segundo y entre 0,3 y 2,2 semitonos de pico a
pico (se quita antes la tendencia, para que subir o bajar poco a poco no cuente). En cuanto se detecta, se dibuja una
onda del color del cantante sobre la caja. Al cerrar la nota, si además se cantó bien (más de la mitad acertada), se
suma la mitad de lo que vale esa nota y sale el aviso «Vibrato +N». Probado con voces simuladas: los vibratos reales
se detectan casi siempre y una nota recta, un temblor al azar o un desliz lento no cuentan.
