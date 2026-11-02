// Gramola nativa · capa de plataforma.
// Lo único que cambia entre la PS4 (piglet + ScePad + SceAudioOut/In) y el Mac (SDL2, para desarrollar):
// pantalla (texturas y dibujar rectángulos de textura con opacidad), mando, salida de audio, micro, reloj y rutas.
#pragma once
#include <cstdint>
#include <string>

namespace plat {

constexpr int W = 1920, H = 1080;   // tamaño lógico de la pantalla

// Botones (los de la PS4; en el Mac, teclado o mando)
enum : uint32_t {
  B_UP = 1, B_DOWN = 2, B_LEFT = 4, B_RIGHT = 8,
  B_CROSS = 16, B_CIRCLE = 32, B_SQUARE = 64, B_TRIANGLE = 128,
  B_L1 = 256, B_R1 = 512, B_OPTIONS = 1024, B_QUIT = 1u << 31,
};

bool init();
void shutdown();
bool frame_begin(uint32_t clear_rgb);   // false: salir
void frame_end();

// Texturas RGBA (alfa sin premultiplicar)
int tex_create(int w, int h, const uint8_t *rgba, bool smooth = true);
void tex_free(int id);
// Dibuja la parte (sx,sy,sw,sh) de la textura en (dx,dy,dw,dh), con opacidad 0..1
void draw(int id, int tw, int th, float sx, float sy, float sw, float sh, float dx, float dy, float dw, float dh, float alpha);

uint32_t buttons();

// Audio de salida: 48 kHz estéreo s16. La función se llama desde otro hilo.
constexpr int RATE = 48000;
void audio_start(void (*fill)(int16_t *out, int frames));
double audio_latency();   // segundos entre lo que se rellena y lo que suena

// Micro: muestras mono float a mic_rate(); lee lo que haya (no bloquea)
bool mic_open();
int mic_rate();
int mic_read(float *out, int max);
void mic_close();

double now();               // segundos, monótono
std::string assets();       // carpeta de recursos (con / final)
std::string songs_dir();    // carpeta de canciones
void log(const char *fmt, ...);

}  // namespace plat
