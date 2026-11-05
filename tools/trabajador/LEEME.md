# Trabajador de creación de canciones

Corre **en el mismo servidor** que Gramola, como servicio `gramola-trabajador`, con prioridad mínima de CPU y disco y
límites (2,5 núcleos, 5 GB) para no frenar el resto de webs. Atiende la cola del admin (*Creación*):

- **Crear canción**: audio + letra → `.txt` UltraStar, que queda como **borrador** hasta publicarlo.
- **Analizar la voz** de una canción que ya existe: `voz.mp3` (la voz sola), `voz-tono.json` (su tono cada 10 ms) y
  `voz-tramos.json` (tramos de voz por los silencios y lo que dice cada uno, palabra a palabra con su tiempo), que el
  editor usa para enseñar cada frase sobre su trozo de voz.

| Paso | Herramienta | Notas |
|---|---|---|
| Separar la voz | Demucs `htdemucs` | CPU (en un Mac usa la GPU si se ejecuta allí) |
| Tono | CREPE (modelo pequeño) · pYIN de reserva | En una canción de prueba: 76 % de notas a ±1 semitono frente al 54 % de pYIN |
| Tramos y reconocimiento | Energía de la voz separada (silencios de 0,35 s separan; tramos de 0,3 s o más) · faster-whisper `small` (int8, CPU; `GRAMOLA_ASR` cambia el modelo) | ~50 s por canción, 850 MB. Idioma: el de la letra o, si no, el que whisper detecta en el tramo más largo |
| Encajar la letra | Alineador forzado MMS (wav2vec2, torchaudio) | No transcribe: coloca la letra dada. Cada línea se busca solo en la zona donde la voz la dice (palabras reconocidas emparejadas con la letra en orden, coincidencias largas primero; si no hay reconocimiento, con la letra sincronizada LRC). La primera sílaba de cada frase se lleva a donde arranca la voz de su tramo (si está a menos de 0,6 s). En la prueba, mediana de 65 ms y el 90 % de las palabras a menos de 150 ms de la versión hecha a mano |
| Sílabas | pyphen | Castellano, inglés, catalán, francés, italiano, portugués, alemán, gallego, euskera |

En el servidor (4 núcleos, con los límites del servicio) tarda unos **5 minutos por canción**, con un pico de ~3,2 GB de memoria.
Los modelos (~1,3 GB) se descargan la primera vez en `/opt/gramola-trabajador/cache`.

## Instalación en el servidor (Ubuntu)

```bash
apt install ffmpeg
mkdir -p /opt/gramola-trabajador/cache && cd /opt/gramola-trabajador
uv venv --python /usr/bin/python3.12 .venv
uv pip install --python .venv/bin/python --index-url https://download.pytorch.org/whl/cpu \
  --extra-index-url https://pypi.org/simple --index-strategy unsafe-best-match \
  "torch==2.8.0+cpu" "torchaudio==2.8.0+cpu" "demucs==4.0.1" "torchcrepe==0.0.24" \
  "librosa==0.11.0" "pyphen==0.17.2" "soundfile==0.13.1" "numpy<2.3" "faster-whisper>=1.2"
chown -R USUARIO:psacln /opt/gramola-trabajador
```

torch se instala solo para CPU (sin los paquetes de tarjeta gráfica) y torchaudio se queda en 2.8: en las versiones
siguientes ya no está el alineador forzado.

Configuración en `/opt/gramola-trabajador/config.json` (permisos 600, del usuario del servicio). La clave se genera en el
admin, *Creación → Clave del trabajador*; el servidor solo guarda su huella:

```json
{"url": "http://127.0.0.1:8877", "host": "admin.TU-DOMINIO", "token": "…"}
```

Servicio: copiar `deploy/gramola-trabajador.service` a `/etc/systemd/system/` (cambiando `USUARIO` y `DOMINIO`) y
`systemctl enable --now gramola-trabajador`. Registro: `journalctl -u gramola-trabajador`.

## Spotify (importar una canción)

El trabajador también atiende «Importar desde Spotify» con el motor del antiguo Gramola, copiado tal cual (zotify
`08d844f` y librespot `1810462` con sus parches) en `/opt/gramola-trabajador/spotify`: su propio `venv` con
Python 3.14 (las versiones de `requirements` de aquel proyecto), `credentials.json` y `spotify_app.json` (600, del
usuario del servicio) y `home/` para la configuración de zotify. Solo canciones sueltas.

## A mano (sin admin)

```bash
.venv/bin/python tools/trabajador/crear.py crear cancion.mp3 letra.txt salida/ --titulo T --artista A --idioma es
.venv/bin/python tools/trabajador/crear.py analizar cancion.mp3 salida/
```
