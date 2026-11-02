// Plataforma PS4 (OpenOrbis): piglet (OpenGL ES 2 del sistema) con el shader precompilado de texturas del
// navegador, ScePad, SceAudioOut y SceAudioIn. Basado en el ejemplo de piglet de OpenOrbis (flat_z).
#include "plat.h"
#include <orbis/Pigletv2VSH.h>
#include <orbis/libkernel.h>
#include <orbis/SystemService.h>
#include <orbis/Sysmodule.h>
#include <orbis/UserService.h>
#include <orbis/Pad.h>
#include <orbis/AudioOut.h>
#include <pthread.h>
#include <sys/stat.h>
#include <time.h>
#include <cstdarg>
#include <cstdio>
#include <cstring>
#include <map>
#include <mutex>
#include <vector>

// SceAudioIn: las cabeceras de OpenOrbis no traen los prototipos (conocidos por los emuladores de PS4)
extern "C" {
int32_t sceAudioInOpen(int32_t userId, uint32_t type, uint32_t index, uint32_t len, uint32_t freq, uint32_t param);
int32_t sceAudioInInput(int32_t handle, void *dest);
int32_t sceAudioInClose(int32_t handle);
}

namespace plat {

struct ShaderBlob { char *ident; unsigned char hash[16]; uint64_t len; unsigned char *code; };
extern "C" ShaderBlob scePrecompiledShaderEntries[];

static EGLDisplay dpy;
static EGLSurface surf;
static EGLContext ctx;
static GLuint prog;
static GLint u_mv, u_proj, u_tex, u_samp, u_op, a_vert;
static int32_t user = ORBIS_USER_SERVICE_USER_ID_SYSTEM, pad = -1;
static FILE *logf;

void log(const char *fmt, ...) {
  char b[1024];
  va_list a; va_start(a, fmt); vsnprintf(b, sizeof b, fmt, a); va_end(a);
  printf("[gramola] %s\n", b);
  if (logf) { fprintf(logf, "%s\n", b); fflush(logf); }
}

static std::pair<unsigned char *, uint64_t> shader(const char *name) {
  for (ShaderBlob *e = scePrecompiledShaderEntries; e->ident; ++e)
    if (!strcmp(name, e->ident)) return {e->code, e->len};
  return {nullptr, 0};
}

bool init() {
  mkdir("/data/gramola", 0777);
  logf = fopen("/data/gramola/registro.txt", "w");
  log("arranque");
  // Las librerías del sistema no se cargan solas aunque el ELF las declare: hay que pedirlas una a una
  // (si no, la primera llamada acaba en PRX_NOT_RESOLVED_FUNCTION).
  struct { const char *n; OrbisSysModuleInternal id; } mods[] = {
    {"SystemService", ORBIS_SYSMODULE_INTERNAL_SYSTEM_SERVICE}, {"UserService", ORBIS_SYSMODULE_INTERNAL_USER_SERVICE},
    {"Pad", ORBIS_SYSMODULE_INTERNAL_PAD}, {"AudioOut", ORBIS_SYSMODULE_INTERNAL_AUDIOOUT}, {"AudioIn", ORBIS_SYSMODULE_INTERNAL_AUDIOIN}};
  int r = 0;
  for (auto &m : mods) { int e = (int)sceSysmoduleLoadModuleInternal(m.id); log("modulo %s = %x", m.n, e); }
  OrbisUserServiceInitializeParams up{}; up.priority = 700;
  r = sceUserServiceInitialize(&up);
  log("UserService init = %x", r);
  r = sceUserServiceGetInitialUser(&user);
  log("usuario = %x (r=%x)", user, r);

  const char *sbw = sceKernelGetFsSandboxRandomWord();
  log("sandbox = %s", sbw ? sbw : "(nulo)");
  std::string pre = std::string("/") + (sbw ? sbw : "") + "/common/lib/";
  int ms = 0;
  r = (int)sceKernelLoadStartModule((pre + "libScePigletv2VSH.sprx").c_str(), 0, nullptr, 0, nullptr, &ms);
  log("piglet modulo = %x (start %x)", r, ms);
  if (r < 0) return false;
  r = (int)sceKernelLoadStartModule((pre + "libScePrecompiledShaders.sprx").c_str(), 0, nullptr, 0, nullptr, &ms);
  log("shaders modulo = %x (start %x)", r, ms);
  if (r < 0) return false;

  OrbisPglConfig cfg{};
  cfg.size = sizeof cfg;
  cfg.flags = ORBIS_PGL_FLAGS_USE_COMPOSITE_EXT | ORBIS_PGL_FLAGS_USE_FLEXIBLE_MEMORY | 0x60;
  cfg.processOrder = 1;
  cfg.systemSharedMemorySize = 250 * 1024 * 1024;
  cfg.videoSharedMemorySize = 512 * 1024 * 1024;
  cfg.maxMappedFlexibleMemory = 170 * 1024 * 1024;
  cfg.drawCommandBufferSize = 1 * 1024 * 1024;
  cfg.lcueResourceBufferSize = 1 * 1024 * 1024;
  cfg.dbgPosCmd_0x40 = W; cfg.dbgPosCmd_0x44 = H; cfg.dbgPosCmd_0x48 = 0; cfg.dbgPosCmd_0x4C = 0;
  cfg.unk_0x5C = 2;
  log("piglet config...");
  if (!scePigletSetConfigurationVSH(&cfg)) { log("piglet config fallo"); return false; }
  log("piglet config ok");

  dpy = eglGetDisplay(EGL_DEFAULT_DISPLAY);
  log("egl display %p", (void *)dpy);
  EGLint maj, min, n = 0;
  if (!eglInitialize(dpy, &maj, &min) || !eglBindAPI(EGL_OPENGL_ES_API)) { log("egl init fallo %x", eglGetError()); return false; }
  log("egl %d.%d", maj, min);
  eglSwapInterval(dpy, 0);   // como el ejemplo de OpenOrbis: con 1 eglSwapBuffers se queda bloqueado
  const EGLint at[] = {EGL_RED_SIZE, 8, EGL_GREEN_SIZE, 8, EGL_BLUE_SIZE, 8, EGL_ALPHA_SIZE, 8, EGL_DEPTH_SIZE, 0, EGL_STENCIL_SIZE, 0,
                       EGL_SAMPLE_BUFFERS, 0, EGL_SAMPLES, 0, EGL_RENDERABLE_TYPE, EGL_OPENGL_ES2_BIT, EGL_SURFACE_TYPE, EGL_WINDOW_BIT, EGL_NONE};
  EGLConfig ec;
  if (!eglChooseConfig(dpy, at, &ec, 1, &n) || n < 1) { log("egl config"); return false; }
  static OrbisPglWindow rw{0, (khronos_uint32_t)W, (khronos_uint32_t)H};
  const EGLint wa[] = {EGL_RENDER_BUFFER, EGL_BACK_BUFFER, EGL_NONE};
  surf = eglCreateWindowSurface(dpy, ec, &rw, wa);
  const EGLint ca[] = {EGL_CONTEXT_CLIENT_VERSION, 2, EGL_NONE};
  ctx = eglCreateContext(dpy, ec, EGL_NO_CONTEXT, ca);
  if (surf == EGL_NO_SURFACE || ctx == EGL_NO_CONTEXT || !eglMakeCurrent(dpy, surf, surf, ctx)) { log("egl contexto"); return false; }

  log("contexto gl ok");
  auto v = shader("texmap/v_2.vert"), f = shader("texmap/f_2.frag");
  if (!v.first || !f.first) { log("shaders texmap no encontrados"); return false; }
  GLuint vs = glCreateShader(GL_VERTEX_SHADER), fs = glCreateShader(GL_FRAGMENT_SHADER);
  glShaderBinary(1, &vs, 0, v.first, v.second);
  glShaderBinary(1, &fs, 0, f.first, f.second);
  prog = glCreateProgram();
  glAttachShader(prog, vs); glAttachShader(prog, fs); glLinkProgram(prog);
  u_mv = glGetUniformLocation(prog, "u_modelViewMatrix");
  u_proj = glGetUniformLocation(prog, "u_projectionMatrix");
  u_tex = glGetUniformLocation(prog, "u_textureSpaceMatrix");
  u_samp = glGetUniformLocation(prog, "s_sampler");
  u_op = glGetUniformLocation(prog, "u_opacity");
  a_vert = glGetAttribLocation(prog, "a_vertex");
  glUseProgram(prog);
  const float pr[16] = {2.f / W, 0, 0, 0, 0, -2.f / H, 0, 0, 0, 0, -1, 0, -1, 1, 0, 1};   // orto: 0..W, 0..H (y hacia abajo)
  glUniformMatrix4fv(u_proj, 1, GL_FALSE, pr);
  glUniform1i(u_samp, 0);
  glEnable(GL_BLEND);
  glBlendFunc(GL_SRC_ALPHA, GL_ONE_MINUS_SRC_ALPHA);
  glViewport(0, 0, W, H);

  log("shaders ok, programa %u", prog);
  r = scePadInit();
  pad = scePadOpen(user, 0, 0, nullptr);
  log("pad init %x, pad %d", r, pad);
  sceSystemServiceHideSplashScreen();
  log("piglet listo: %s", (const char *)glGetString(GL_RENDERER));
  return true;
}

void shutdown() {}

bool frame_begin(uint32_t c) {
  glClearColor(((c >> 16) & 255) / 255.f, ((c >> 8) & 255) / 255.f, (c & 255) / 255.f, 1);
  glClear(GL_COLOR_BUFFER_BIT);
  glUseProgram(prog);
  return true;
}

static long frames = 0;
static double last_swap = 0;
void frame_end() {
  if (frames < 3) log("frame %ld: antes de eglSwapBuffers", frames);
  EGLBoolean ok = eglSwapBuffers(dpy, surf);
  if (frames < 3) log("frame %ld: eglSwapBuffers = %d (err %x)", frames, (int)ok, eglGetError());
  else if (frames % 300 == 0) log("frame %ld t=%.3f", frames, now());
  frames++;
  // Sin vsync: ~60 fps a mano para no quemar la CPU
  double t = now();
  double resto = (1.0 / 60) - (t - last_swap);
  if (resto > 0.0005 && resto < 0.02) sceKernelUsleep((unsigned)(resto * 1e6));
  last_swap = now();
}

int tex_create(int w, int h, const uint8_t *rgba, bool smooth) {
  GLuint t = 0;
  glPixelStorei(GL_UNPACK_ALIGNMENT, 1);
  glGenTextures(1, &t);
  glBindTexture(GL_TEXTURE_2D, t);
  glTexImage2D(GL_TEXTURE_2D, 0, GL_RGBA, w, h, 0, GL_RGBA, GL_UNSIGNED_BYTE, rgba);
  glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, smooth ? GL_LINEAR : GL_NEAREST);
  glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, smooth ? GL_LINEAR : GL_NEAREST);
  glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_CLAMP_TO_EDGE);
  glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_CLAMP_TO_EDGE);
  return (int)t;
}

void tex_free(int id) { GLuint t = id; glDeleteTextures(1, &t); }

void draw(int id, int tw, int th, float sx, float sy, float sw, float sh, float dx, float dy, float dw, float dh, float a) {
  if (a <= 0 || id <= 0) return;
  static const GLfloat q[] = {0, 1, 0, 1, 1, 0, 1, 0, 0, 0, 0, 0, 0, 1, 0, 1, 1, 1, 1, 1, 1, 0, 1, 0};
  const float mv[16] = {dw, 0, 0, 0, 0, dh, 0, 0, 0, 0, 1, 0, dx, dy, 0, 1};
  const float ts[16] = {sw / tw, 0, 0, 0, 0, sh / th, 0, 0, 0, 0, 1, 0, sx / tw, sy / th, 0, 1};
  glUniform1f(u_op, a > 1 ? 1 : a);
  glUniformMatrix4fv(u_mv, 1, GL_FALSE, mv);
  glUniformMatrix4fv(u_tex, 1, GL_FALSE, ts);
  glVertexAttribPointer(a_vert, 4, GL_FLOAT, GL_FALSE, 4 * sizeof(GLfloat), q);
  glEnableVertexAttribArray(a_vert);
  glActiveTexture(GL_TEXTURE0);
  glBindTexture(GL_TEXTURE_2D, id);
  glDrawArrays(GL_TRIANGLES, 0, 6);
}

uint32_t buttons() {
  if (pad < 0) return 0;
  OrbisPadData d{};
  int r = scePadReadState(pad, &d);
  static long n = 0; static int logged_press = 0;
  if (n++ % 600 == 0 || r != 0) log("pad: read=%x conectado=%d botones=%08x stick=%d,%d", r, d.connected, d.buttons, d.leftStick.x, d.leftStick.y);
  if (r != 0) return 0;
  if (d.buttons && logged_press < 10) { logged_press++; log("pad: pulsado %08x", d.buttons); }
  uint32_t b = d.buttons, o = 0;
  if (b & ORBIS_PAD_BUTTON_UP) o |= B_UP;
  if (b & ORBIS_PAD_BUTTON_DOWN) o |= B_DOWN;
  if (b & ORBIS_PAD_BUTTON_LEFT) o |= B_LEFT;
  if (b & ORBIS_PAD_BUTTON_RIGHT) o |= B_RIGHT;
  if (b & ORBIS_PAD_BUTTON_CROSS) o |= B_CROSS;
  if (b & ORBIS_PAD_BUTTON_CIRCLE) o |= B_CIRCLE;
  if (b & ORBIS_PAD_BUTTON_SQUARE) o |= B_SQUARE;
  if (b & ORBIS_PAD_BUTTON_TRIANGLE) o |= B_TRIANGLE;
  if (b & ORBIS_PAD_BUTTON_L1) o |= B_L1;
  if (b & ORBIS_PAD_BUTTON_R1) o |= B_R1;
  if (b & ORBIS_PAD_BUTTON_OPTIONS) o |= B_OPTIONS;
  // palanca izquierda como cruceta
  if (d.leftStick.y < 40) o |= B_UP;
  if (d.leftStick.y > 215) o |= B_DOWN;
  if (d.leftStick.x < 40) o |= B_LEFT;
  if (d.leftStick.x > 215) o |= B_RIGHT;
  return o;
}

// ---------------- audio de salida: hilo que rellena bloques de 256 muestras
static void (*fill_fn)(int16_t *, int);
static int32_t aout = -1;
static void *aout_loop(void *) {
  static int16_t buf[256 * 2];
  for (;;) { fill_fn(buf, 256); sceAudioOutOutput(aout, buf); }
  return nullptr;
}

void audio_start(void (*fill)(int16_t *, int)) {
  fill_fn = fill;
  sceAudioOutInit();
  aout = sceAudioOutOpen(ORBIS_USER_SERVICE_USER_ID_SYSTEM, ORBIS_AUDIO_OUT_PORT_TYPE_MAIN, 0, 256, RATE, ORBIS_AUDIO_OUT_PARAM_FORMAT_S16_STEREO);
  if (aout < 0) { log("audio (usuario sistema): %x, probando con el usuario real", aout); aout = sceAudioOutOpen(user, ORBIS_AUDIO_OUT_PORT_TYPE_MAIN, 0, 256, RATE, ORBIS_AUDIO_OUT_PARAM_FORMAT_S16_STEREO); }
  if (aout < 0) { log("sin salida de audio: %x", aout); return; }
  log("salida de audio abierta: %d", aout);
  pthread_t t; pthread_create(&t, nullptr, aout_loop, nullptr);
}

double audio_latency() { return 256.0 / RATE * 3; }

// ---------------- micro: hilo que lee de SceAudioIn (micro USB o el auricular del mando)
static int32_t ain = -1;
static int ain_rate = 16000;
static std::mutex mic_mx;
static std::vector<float> mic_buf;
static volatile bool mic_on = false;
static void *ain_loop(void *) {
  static int16_t b[256];
  while (mic_on) {
    int r = sceAudioInInput(ain, b);
    if (r < 0) { log("sceAudioInInput: %x", r); break; }
    std::lock_guard<std::mutex> g(mic_mx);
    for (int i = 0; i < 256; i++) mic_buf.push_back(b[i] / 32768.f);
    if (mic_buf.size() > 48000) mic_buf.erase(mic_buf.begin(), mic_buf.end() - 48000);
  }
  return nullptr;
}

bool mic_open() {
  if (ain >= 0) return true;
  // Tipo 1 = general (admite 48 kHz), tipo 0 = chat de voz (16 kHz). Formato 0 = s16 mono.
  const struct { uint32_t type, freq; } p[] = {{1, 48000}, {0, 16000}, {1, 16000}};
  for (auto &x : p) {
    ain = sceAudioInOpen(user, x.type, 0, 256, x.freq, 0);
    log("sceAudioInOpen(tipo %u, %u Hz) = %x", x.type, x.freq, ain);
    if (ain >= 0) { ain_rate = x.freq; break; }
  }
  if (ain < 0) return false;
  mic_on = true;
  pthread_t t; pthread_create(&t, nullptr, ain_loop, nullptr);
  return true;
}

int mic_rate() { return ain_rate; }

int mic_read(float *out, int max) {
  std::lock_guard<std::mutex> g(mic_mx);
  int n = (int)std::min<size_t>(max, mic_buf.size());
  std::copy(mic_buf.begin(), mic_buf.begin() + n, out);
  mic_buf.erase(mic_buf.begin(), mic_buf.begin() + n);
  return n;
}

void mic_close() {}

// clock_gettime de la libc de OpenOrbis va ~250 veces lento en la consola: el reloj fiable es el del kernel (µs desde el arranque del proceso)
double now() { return sceKernelGetProcessTime() / 1e6; }
std::string assets() { return "/app0/assets/"; }
std::string songs_dir() { return "/data/gramola/canciones"; }

}  // namespace plat
