// Plataforma de escritorio (Mac) con SDL2: para desarrollar y sacar capturas. Misma app que en la PS4.
#include "plat.h"
#include <SDL.h>
#include <cstdarg>
#include <cstdio>
#include <cstdlib>
#include <map>
#include <mutex>
#include <vector>

namespace plat {

static SDL_Window *win;
static SDL_Renderer *ren;
static std::map<int, SDL_Texture *> texs;
static int next_id = 1;
static SDL_GameController *pad;
static uint32_t keys;
static void (*audio_fill)(int16_t *, int);
static SDL_AudioDeviceID adev, mdev;
static std::mutex mic_mx;
static std::vector<float> mic_buf;
static int mic_hz = 48000;
// Guion de pruebas (GRAMOLA_GUION="3.2:cross 5:right 8:shot=a.bmp …"): pulsa botones y guarda capturas a su hora
struct Paso { double t; uint32_t b; std::string shot; };
static std::vector<Paso> guion;
static double t_inicio = 0;
static uint32_t guion_b = 0;
static void cargar_guion() {
  const char *g = getenv("GRAMOLA_GUION");
  if (!g) return;
  std::string s = g; size_t i = 0;
  while (i < s.size()) {
    size_t e = s.find(' ', i); std::string tok = s.substr(i, e == std::string::npos ? std::string::npos : e - i);
    i = e == std::string::npos ? s.size() : e + 1;
    size_t c = tok.find(':'); if (c == std::string::npos) continue;
    Paso p{atof(tok.c_str()), 0, ""}; std::string a = tok.substr(c + 1);
    if (a.rfind("shot=", 0) == 0) p.shot = a.substr(5);
    else if (a == "quit") p.b = B_QUIT;
    else { const char *n[] = {"up","down","left","right","cross","circle","square","triangle","l1","r1","options"};
      for (int k = 0; k < 11; k++) if (a == n[k]) p.b = 1u << k; }
    guion.push_back(p);
  }
}

bool init() {
  if (SDL_Init(SDL_INIT_VIDEO | SDL_INIT_AUDIO | SDL_INIT_GAMECONTROLLER) != 0) return false;
  SDL_SetHint(SDL_HINT_RENDER_SCALE_QUALITY, "1");
  int ww = getenv("GRAMOLA_VENTANA") ? atoi(getenv("GRAMOLA_VENTANA")) : 1280;
  win = SDL_CreateWindow("Gramola", SDL_WINDOWPOS_CENTERED, SDL_WINDOWPOS_CENTERED, ww, ww * 9 / 16, SDL_WINDOW_ALLOW_HIGHDPI | SDL_WINDOW_RESIZABLE);
  ren = SDL_CreateRenderer(win, -1, SDL_RENDERER_ACCELERATED | SDL_RENDERER_PRESENTVSYNC);
  if (!win || !ren) return false;
  SDL_RenderSetLogicalSize(ren, W, H);
  SDL_SetRenderDrawBlendMode(ren, SDL_BLENDMODE_BLEND);
  cargar_guion(); t_inicio = SDL_GetPerformanceCounter() / (double)SDL_GetPerformanceFrequency();
  for (int i = 0; i < SDL_NumJoysticks(); i++) if (SDL_IsGameController(i)) { pad = SDL_GameControllerOpen(i); break; }
  return true;
}

void shutdown() {
  if (adev) SDL_CloseAudioDevice(adev);
  mic_close();
  for (auto &t : texs) SDL_DestroyTexture(t.second);
  SDL_DestroyRenderer(ren); SDL_DestroyWindow(win); SDL_Quit();
}

static uint32_t keybit(SDL_Keycode k) {
  switch (k) {
    case SDLK_UP: return B_UP; case SDLK_DOWN: return B_DOWN; case SDLK_LEFT: return B_LEFT; case SDLK_RIGHT: return B_RIGHT;
    case SDLK_RETURN: case SDLK_SPACE: case SDLK_x: return B_CROSS;
    case SDLK_ESCAPE: case SDLK_BACKSPACE: case SDLK_o: return B_CIRCLE;
    case SDLK_s: return B_SQUARE; case SDLK_t: return B_TRIANGLE;
    case SDLK_q: return B_L1; case SDLK_w: return B_R1; case SDLK_p: return B_OPTIONS;
  }
  return 0;
}

bool frame_begin(uint32_t c) {
  SDL_Event e;
  while (SDL_PollEvent(&e)) {
    if (e.type == SDL_QUIT) return false;
    if (e.type == SDL_KEYDOWN && !e.key.repeat) keys |= keybit(e.key.keysym.sym);
    if (e.type == SDL_KEYUP) keys &= ~keybit(e.key.keysym.sym);
    if (e.type == SDL_CONTROLLERDEVICEADDED && !pad) pad = SDL_GameControllerOpen(e.cdevice.which);
  }
  SDL_SetRenderDrawColor(ren, (c >> 16) & 255, (c >> 8) & 255, c & 255, 255);
  SDL_RenderClear(ren);
  return true;
}

void frame_end() {
  double t = SDL_GetPerformanceCounter() / (double)SDL_GetPerformanceFrequency() - t_inicio;
  guion_b = 0;
  for (auto it = guion.begin(); it != guion.end();) {
    if (it->t > t) { ++it; continue; }
    if (!it->shot.empty()) {
      int w, h; SDL_GetRendererOutputSize(ren, &w, &h);
      SDL_Surface *sf = SDL_CreateRGBSurfaceWithFormat(0, w, h, 32, SDL_PIXELFORMAT_ARGB8888);
      SDL_RenderReadPixels(ren, nullptr, SDL_PIXELFORMAT_ARGB8888, sf->pixels, sf->pitch);
      SDL_SaveBMP(sf, it->shot.c_str()); SDL_FreeSurface(sf);
    }
    guion_b |= it->b; it = guion.erase(it);
  }
  SDL_RenderPresent(ren);
}

int tex_create(int w, int h, const uint8_t *rgba, bool smooth) {
  SDL_Texture *t = SDL_CreateTexture(ren, SDL_PIXELFORMAT_ABGR8888, SDL_TEXTUREACCESS_STATIC, w, h);
  if (!t) return 0;
  SDL_UpdateTexture(t, nullptr, rgba, w * 4);
  SDL_SetTextureBlendMode(t, SDL_BLENDMODE_BLEND);
  SDL_SetTextureScaleMode(t, smooth ? SDL_ScaleModeLinear : SDL_ScaleModeNearest);
  texs[next_id] = t;
  return next_id++;
}

void tex_free(int id) {
  auto it = texs.find(id);
  if (it != texs.end()) { SDL_DestroyTexture(it->second); texs.erase(it); }
}

void draw(int id, int, int, float sx, float sy, float sw, float sh, float dx, float dy, float dw, float dh, float a) {
  auto it = texs.find(id);
  if (it == texs.end() || a <= 0) return;
  SDL_Rect s{(int)sx, (int)sy, (int)sw, (int)sh};
  SDL_FRect d{dx, dy, dw, dh};
  SDL_SetTextureAlphaMod(it->second, (Uint8)(a > 1 ? 255 : a * 255));
  SDL_RenderCopyF(ren, it->second, &s, &d);
}

uint32_t buttons() {
  uint32_t b = keys | guion_b;
  if (pad) {
    auto B = [&](SDL_GameControllerButton x) { return SDL_GameControllerGetButton(pad, x); };
    if (B(SDL_CONTROLLER_BUTTON_DPAD_UP)) b |= B_UP;
    if (B(SDL_CONTROLLER_BUTTON_DPAD_DOWN)) b |= B_DOWN;
    if (B(SDL_CONTROLLER_BUTTON_DPAD_LEFT)) b |= B_LEFT;
    if (B(SDL_CONTROLLER_BUTTON_DPAD_RIGHT)) b |= B_RIGHT;
    if (B(SDL_CONTROLLER_BUTTON_A)) b |= B_CROSS;
    if (B(SDL_CONTROLLER_BUTTON_B)) b |= B_CIRCLE;
    if (B(SDL_CONTROLLER_BUTTON_X)) b |= B_SQUARE;
    if (B(SDL_CONTROLLER_BUTTON_Y)) b |= B_TRIANGLE;
    if (B(SDL_CONTROLLER_BUTTON_LEFTSHOULDER)) b |= B_L1;
    if (B(SDL_CONTROLLER_BUTTON_RIGHTSHOULDER)) b |= B_R1;
    if (B(SDL_CONTROLLER_BUTTON_START)) b |= B_OPTIONS;
  }
  return b;
}

static void sdl_audio(void *, Uint8 *s, int len) { audio_fill((int16_t *)s, len / 4); }

void audio_start(void (*fill)(int16_t *, int)) {
  audio_fill = fill;
  SDL_AudioSpec want{}, got{};
  want.freq = RATE; want.format = AUDIO_S16SYS; want.channels = 2; want.samples = 512; want.callback = sdl_audio;
  adev = SDL_OpenAudioDevice(nullptr, 0, &want, &got, 0);
  if (adev) SDL_PauseAudioDevice(adev, 0);
}

double audio_latency() { return 512.0 / RATE * 2; }

static void sdl_mic(void *, Uint8 *s, int len) {
  std::lock_guard<std::mutex> g(mic_mx);
  const float *f = (const float *)s;
  mic_buf.insert(mic_buf.end(), f, f + len / 4);
  if (mic_buf.size() > 48000) mic_buf.erase(mic_buf.begin(), mic_buf.end() - 48000);
}

bool mic_open() {
  if (getenv("GRAMOLA_SIN_MICRO")) return false;
  SDL_AudioSpec want{}, got{};
  want.freq = 48000; want.format = AUDIO_F32SYS; want.channels = 1; want.samples = 512; want.callback = sdl_mic;
  mdev = SDL_OpenAudioDevice(nullptr, 1, &want, &got, 0);
  if (!mdev) return false;
  mic_hz = got.freq;
  SDL_PauseAudioDevice(mdev, 0);
  return true;
}

int mic_rate() { return mic_hz; }

int mic_read(float *out, int max) {
  std::lock_guard<std::mutex> g(mic_mx);
  int n = (int)std::min<size_t>(max, mic_buf.size());
  std::copy(mic_buf.begin(), mic_buf.begin() + n, out);
  mic_buf.erase(mic_buf.begin(), mic_buf.begin() + n);
  return n;
}

void mic_close() { if (mdev) { SDL_CloseAudioDevice(mdev); mdev = 0; } }

double now() { return SDL_GetPerformanceCounter() / (double)SDL_GetPerformanceFrequency(); }

std::string assets() { const char *e = getenv("GRAMOLA_ASSETS"); return e ? std::string(e) + "/" : std::string("assets/"); }
std::string songs_dir() { const char *e = getenv("GRAMOLA_CANCIONES"); return e ? std::string(e) : std::string("canciones"); }

void log(const char *fmt, ...) {
  va_list a; va_start(a, fmt); vfprintf(stderr, fmt, a); va_end(a); fputc('\n', stderr);
}

}  // namespace plat
