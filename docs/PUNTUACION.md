# Puntuación

Es la del diseño, alimentada con la voz real.

## Detección de tono (móvil)

- Micro sin cancelación de eco, supresión de ruido ni control de ganancia.
- YIN sobre 2.048 muestras cada 40 ms (70–1.100 Hz), suelo de ruido adaptativo, claridad mínima 0,8 y mediana de 3.
- Se envía la nota MIDI decimal, el volumen y la latencia estimada.

## En la tele

- Cada nota se divide en **ranuras de 40 ms**. Una ranura cuenta si en ella la voz está dentro del margen:
  - **Fácil ±2**, **Normal ±1**, **Difícil ±½** semitono (por jugador, al preparar la partida). Rap: +0,6.
  - **Octava indiferente**: se compara la nota, no lo grave o agudo.
- **Puntos**: 10.000 repartidos entre todas las ranuras de la parte del cantante; las notas **doradas** valen el doble.
- **Racha**: notas seguidas con más del 60 % acertado. **Dorada acertada**: más del 60 %.
- **Valoración de frase**: > 90 % *Perfecto*, > 75 % *Genial*, > 55 % *Bien*, > 30 % *Regular*, si no *Fallo*.
- **Duelo**: media por equipo y barra de tira y afloja; aviso «Se adelanta…».
- **Retraso**: la muestra se coloca en `reloj − (ajuste del micro + latencia del móvil + latencia de la tele)`;
  el ajuste se mide en **Ajustes → Retraso del micro** cantando «pa» con 8 pitidos.

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
