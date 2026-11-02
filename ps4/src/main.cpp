// Gramola nativa (PS4 / Mac): arranque, bienvenida, menú, canciones, cantar con el micro de la consola,
// cuenta atrás, pausa y resultados. Todo en la consola: sin servidor, canciones y micro locales.
// Medidas, tipografías y colores tomados 1:1 de la tele web (diseño original) sobre un lienzo de 1920×1080.
#include <algorithm>
#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <memory>
#include <mutex>
#include <thread>
#include "audio.h"
#include "gfx.h"
#include "pitch.h"
#include "plat.h"
#include "song.h"

using namespace gfx;

// Colores que la tele usa y que no están en la paleta base de gfx.h
constexpr uint32_t GREY2 = 0x605d5d;    // gris de subtítulos y contadores ("29 canciones", artista en resultados)
constexpr uint32_t TRACK = 0xeae7e7;    // fondo de las barras de progreso
#ifndef GRAMOLA_VERSION_STR
#define GRAMOLA_VERSION_STR "sin version"
#endif
static const char *GAME_VERSION = GRAMOLA_VERSION_STR;   // la del repo (VERSION), inyectada al compilar

// ------------------------------------------------------------------ estado general
enum Screen { S_BOOT, S_WELCOME, S_MENU, S_SONGS, S_LOADING, S_COUNT, S_SING, S_RESULTS };
static Screen screen = S_BOOT;
static double screen_t0 = 0;
static std::vector<Song> songs;
static int sel = 0;
static float scroll = 0;
static double sel_t = 0;      // cuándo se eligió la canción actual (para el avance y el scroll)
static int preview_for = -1;  // qué canción está sonando de avance
static Img logo_white, logo_ink, nuvola_ink, nuvola_white, nuvola_original, disco_rojo;
static std::shared_ptr<audio::Pcm> menu_music, applause;
static const uint32_t PLAYER = 0xff4fa3;   // color del jugador 1 (rosa del diseño)
static double now_t = 0;
static std::string toast_msg; static double toast_t = -10;

static const char *SNAME[] = {"BOOT","WELCOME","MENU","SONGS","LOADING","COUNT","SING","RESULTS"};
static void go(Screen s) { plat::log("[%.2f] %s -> %s", now_t, SNAME[screen], SNAME[s]); screen = s; screen_t0 = now_t; }
static void toast(const std::string &m) { toast_msg = m; toast_t = now_t; }

// ------------------------------------------------------------------ mando: pulsaciones con repetición
static uint32_t prev_b = 0, pressed = 0;
static double held_since[32];
static void read_input() {
  uint32_t b = plat::buttons();
  pressed = b & ~prev_b;
  if (pressed) plat::log("[%.3f] pulsado %x (antes %x) pantalla %s", now_t, pressed, prev_b, SNAME[screen]);
  for (int i = 0; i < 4; i++) {   // flechas: se repiten al mantener
    uint32_t m = 1u << i;
    if (pressed & m) held_since[i] = now_t + 0.38;
    else if ((b & m) && now_t >= held_since[i]) { pressed |= m; held_since[i] = now_t + 0.09; }
  }
  prev_b = b;
}
static bool hit(uint32_t m) { return pressed & m; }

// ------------------------------------------------------------------ decodificación en segundo plano
static std::mutex dec_mx;
static int dec_want = -1, dec_busy = -1, dec_done_idx = -1;
static std::shared_ptr<audio::Pcm> dec_done;
static void request_decode(int idx) {
  std::lock_guard<std::mutex> g(dec_mx);
  if (idx == dec_done_idx || idx == dec_busy) { dec_want = -1; return; }
  dec_want = idx;
  if (dec_busy >= 0) return;
  dec_busy = idx; dec_want = -1;
  std::string path = songs[idx].audio;
  std::thread([idx, path]() {
    auto p = audio::decode(path);
    { std::lock_guard<std::mutex> g(dec_mx); dec_done = p; dec_done_idx = idx; dec_busy = -1; }
    int again;
    { std::lock_guard<std::mutex> g(dec_mx); again = dec_want; }
    if (again >= 0) request_decode(again);
  }).detach();
}
static std::shared_ptr<audio::Pcm> decoded(int idx) {
  std::lock_guard<std::mutex> g(dec_mx);
  return dec_done_idx == idx ? dec_done : nullptr;
}

// ------------------------------------------------------------------ portadas (se cargan cuando se ven)
static std::vector<Img> covers;
static std::vector<char> cover_tried;
static Img cover_of(int i, bool load_now) {
  if (i < 0 || i >= (int)songs.size()) return {};
  if (!covers[i] && !cover_tried[i] && load_now && !songs[i].cover.empty()) { cover_tried[i] = 1; covers[i] = load(songs[i].cover, 400); }
  return covers[i];
}

// ------------------------------------------------------------------ piezas de interfaz
static void bg_grid(uint32_t bg = PAPER) {
  rect(0, 0, plat::W, plat::H, bg);
  for (int x = 96; x < plat::W; x += 192) rect(x, 0, 1, plat::H, 0xe7e5e5);
}
static void hint(float &x, float y, const char *key, const char *label, bool dark = false) {
  float kw = std::max(52.f, text_w(BOLD, 26, key) + 24);
  if (dark) rect(x, y, kw, 52, INK); else frame(x, y, kw, 52, 3, INK);
  text_c(BOLD, 26, key, x + kw / 2, y + 10, dark ? WHITE : INK);
  x += kw + 14;
  x += text(BOLD, 30, label, x, y + 8, INK) + 44;
}
static void hints(std::initializer_list<std::pair<const char *, const char *>> hs, bool last_dark = true) {
  float total = 0;
  for (auto &h : hs) total += std::max(52.f, text_w(BOLD, 26, h.first) + 24) + 14 + text_w(BOLD, 30, h.second) + 44;
  float x = plat::W - 96 - total + 44;
  int i = 0, n = (int)hs.size();
  for (auto &h : hs) hint(x, plat::H - 112, h.first, h.second, last_dark && ++i == n);
}
// Botón redondeado-cuadrado de tecla (el "✕" blanco sobre fondo tinta que usa la tele junto a los textos)
static void keycap(float cx, float cy, const char *k, float side = 60, uint32_t bg = INK, uint32_t fg = WHITE) {
  // Las etiquetas usan letras seguras (X, O): la fuente Archivo no trae los glifos ✕/○/×.
  rect(cx - side / 2, cy - side / 2, side, side, bg);
  text_c(BOLD, side * 0.44f, k, cx, cy - side * 0.19f, fg);
}
// Cabecera compacta (canción + marcador), igual en cantar y pausa
static void sing_header(const Song &S) {
  Img cv = cover_of(sel, true);
  rect(96, 54, 110, 110, INK);
  if (cv) image_cover(cv, 96, 54, 110, 110);
  text(BOLD, 40, fit(BOLD, 40, S.title, 260), 230, 54, INK);
  text(REGULAR, 28, fit(REGULAR, 28, S.artist, 260), 230, 108, INK);
  float bx = 1404;
  rect(bx, 54, 420, 110, WHITE);
  rect(bx, 54, 12, 110, PLAYER);
  rect(bx + 28, 50 + 56 - 10, 20, 20, INK);   // marcador del jugador (un cuadro: más seguro que un glifo de la fuente)
  extern double score_now();
  char sc[32]; snprintf(sc, sizeof sc, "%d", (int)(score_now() + 0.5));
  text(REGULAR, 60, sc, bx + 56, 88, INK);
}

// ------------------------------------------------------------------ ARRANQUE (TV-00 Nuvola + TV-01 Arranque), con los tiempos de la tele
// 0,12 s logo (1 s de fundido, escala 0,94→1 en 4 s) · 1,7 s círculo rojo (1,1 s) · 3,3 s se va el logo (0,7 s) ·
// 4,0 s aviso (0,5 s) · 10,0 s se va el aviso · 10,6 s pantalla roja (0,8 s) con «Cargando canciones…» 2,6 s · bienvenida
static float ease_io(float t) { t = std::max(0.f, std::min(1.f, t)); return t < 0.5f ? 4 * t * t * t : 1 - powf(-2 * t + 2, 3) / 2; }   // ≈ cubic-bezier(.7,0,.2,1)
static float ease_out(float t) { t = std::max(0.f, std::min(1.f, t)); return 1 - powf(1 - t, 3); }                                   // ≈ cubic-bezier(.2,.8,.2,1)
static void disco(float cx, float cy, float r, float a) { if (disco_rojo) image(disco_rojo, cx - r, cy - r, 2 * r, 2 * r, a); }
// Texto blanco centrado partido en líneas que quepan en «maxw»
static float parrafo(Font f, float px, const std::string &txt, float cx, float y, float maxw, float lh, uint32_t rgb, float a) {
  std::string linea, palabra; std::vector<std::string> lineas;
  for (size_t i = 0; i <= txt.size(); i++) {
    char c = i < txt.size() ? txt[i] : ' ';
    if (c == ' ') {
      std::string prueba = linea.empty() ? palabra : linea + " " + palabra;
      if (text_w(f, px, prueba) > maxw && !linea.empty()) { lineas.push_back(linea); linea = palabra; } else linea = prueba;
      palabra.clear();
    } else palabra += c;
  }
  if (!linea.empty()) lineas.push_back(linea);
  for (auto &l : lineas) { text_c(f, px, l, cx, y, rgb, a); y += lh; }
  return y;
}
static void draw_boot() {
  double t = now_t - screen_t0;
  if (t < 10.6) {
    rect(0, 0, plat::W, plat::H, 0x0e0f0f);
    // círculo rojo: circle(75 %) = radio 0,75 · diagonal/√2 ≈ 1168 px
    if (t > 1.7) disco(plat::W / 2.f, plat::H / 2.f, 1168 * ease_io((float)((t - 1.7) / 1.1)), 1);
    // logo bitono de nuvola, 190 px de alto, centrado
    float a = t < 0.12 ? 0 : t < 3.3 ? ease_out((float)((t - 0.12) / 1.0)) : 1 - ease_out((float)((t - 3.3) / 0.7));
    float k = 0.94f + 0.06f * ease_out((float)((t - 0.12) / 4.0));
    if (nuvola_original && a > 0) { float h = 190 * k, w = h * nuvola_original.w / nuvola_original.h; image(nuvola_original, (plat::W - w) / 2, (plat::H - h) / 2, w, h, a); }
    // aviso
    if (t > 4.0) {
      float am = t < 10.0 ? ease_out((float)((t - 4.0) / 0.5)) : 1 - ease_out((float)((t - 10.0) / 0.5));
      float dy = 18 * (1 - ease_out((float)((t - 4.0) / 0.7)));
      if (am > 0) {
        // bloque centrado verticalmente: 2 líneas de 66 px + 32 + 52 + 32 + 3 líneas de 42 px ≈ 374 px
        float y = (plat::H - 374) / 2 + dy;
        text_c(BOLD, 60, "Gramola es un proyecto gratuito", plat::W / 2.f, y, WHITE, am); y += 66;
        text_c(BOLD, 60, "y sin ánimo de lucro.", plat::W / 2.f, y, WHITE, am); y += 66 + 32;
        text_c(REGULAR, 40, "Nunca se solicitará ningún pago por su uso.", plat::W / 2.f, y, WHITE, am); y += 52 + 32;
        parrafo(REGULAR, 30, "Gramola no tiene relación alguna con los artistas, autores o compañías discográficas de las obras que incluye, cuyos derechos pertenecen a sus respectivos titulares.", plat::W / 2.f, y, 1250, 42, WHITE, am * 0.92f);
      }
    }
    return;
  }
  // pantalla roja de carga (TV-01 Arranque); el 0,7 s de espera de la tele + fundido de 0,8 s
  double tb = t - 10.6 - 0.7;
  rect(0, 0, plat::W, plat::H, RED);
  if (tb < 0) return;
  float a = ease_out((float)(tb / 0.8));
  text(BOLD, 28, "KARAOKE EN CASA", 96, 54, INK, a);
  text_r(BOLD, 28, "PS4", plat::W - 96, 54, INK, a);
  if (logo_white) { float w = 1430, h = w * logo_white.h / logo_white.w; image(logo_white, 96, 560 - h / 2 + 40, w, h, a); }
  double k = std::min(1.0, tb / 2.6);
  if (!menu_music) k = std::min(k, 0.95);
  char pc[16]; snprintf(pc, sizeof pc, "%d %%", (int)(k * 100));
  text(BOLD, 32, "Cargando canciones…", 96, 958, INK, a);
  text_r(BOLD, 32, pc, plat::W - 96, 958, INK, a);
  rect(96, 1018, plat::W - 192, 8, INK, 0.25f * a);
  rect(96, 1018, (float)((plat::W - 192) * k), 8, INK, a);
  if (k >= 1) go(S_WELCOME);
}

// ------------------------------------------------------------------ BIENVENIDA (TV-01b)
static void draw_welcome() {
  double t = now_t - screen_t0;
  bg_grid();
  if (logo_ink) { float w = 1050, h = w * logo_ink.h / logo_ink.w; image(logo_ink, (plat::W - w) / 2, 400 - h / 2, w, h); }
  bool blink = fmod(t, 1.1) < 0.8;
  float cx = plat::W / 2.f;
  float wp = text_w(BOLD, 40, "Pulsa"), wc = text_w(BOLD, 40, "para continuar");
  float total = wp + 20 + 60 + 20 + wc;
  float x = cx - total / 2;
  float al = blink ? 1.f : 0.35f;
  x += text(BOLD, 40, "Pulsa", x, 850, INK, al) + 20;
  keycap(x + 30, 880, "X", 60, INK, WHITE); x += 60 + 20;
  text(BOLD, 40, "para continuar", x, 850, INK, al);
  text_r(SEMIBOLD, 28, std::string("Versión ") + GAME_VERSION, plat::W - 96, 982, GREY2);
  if (songs.empty()) {
    text(SEMIBOLD, 30, "No hay canciones instaladas. Cópialas por FTP en " + plat::songs_dir(), 96, 982, RED);
  } else if (hit(plat::B_CROSS)) { plat::log("bienvenida: X con t=%.3f", t); go(S_MENU); }
}

// ------------------------------------------------------------------ MENÚ (TV-03): 7 modos, solo «Cantar» funciona
struct MenuItem { const char *title, *sub, *desc; };
static const MenuItem MENU[7] = {
  {"Cantar", "Solo o todos", "Solo o todos a la vez. Cada móvil, una voz."},
  {"Duelo", "Cara a cara", "Cara a cara, por equipos."},
  {"Megamix", "Estribillos", "El estribillo de varias canciones, seguidas."},
  {"Pásalo", "Equipos y retos", "Equipos y retos, turno a turno."},
  {"Jukebox", "Sin puntos", "Suena la canción sin puntuar."},
  {"Récords", "Los mejores", "Las mejores puntuaciones de cada canción."},
  {"Ajustes", "Audio y sala", "Audio, sala y calibración del micro."},
};
static int menu_sel = 0;
static void draw_menu() {
  if (hit(plat::B_LEFT)) menu_sel = (menu_sel + 6) % 7;
  if (hit(plat::B_RIGHT)) menu_sel = (menu_sel + 1) % 7;
  if (hit(plat::B_CIRCLE)) { go(S_WELCOME); return; }
  if (hit(plat::B_CROSS)) {
    if (menu_sel == 0) { sel = 0; sel_t = now_t; go(S_SONGS); return; }
    else toast("Próximamente");
  }
  bg_grid();
  if (logo_ink) { float h = 52, w = h * logo_ink.w / logo_ink.h; image(logo_ink, 96, 75, w, h); }
  char idx[8]; snprintf(idx, sizeof idx, "%02d", menu_sel + 1);
  text(BOLD, 28, idx, 96, 275, RED);
  text_r(BOLD, 28, "/ 07", plat::W - 96, 275, RED);
  text(REGULAR, 184, MENU[menu_sel].title, 92, 290, INK);
  text(REGULAR, 40, MENU[menu_sel].desc, 96, 505, 0x444141);
  // rejilla de 7 modos
  const float TY = 682, TH = 264, PAD = 4, GAP = 2;
  float tw = (1728 - PAD * 2 - GAP * 6) / 7.f;
  rect(96, TY, 1728, TH, WHITE); frame(96, TY, 1728, TH, 2, INK);
  for (int i = 0; i < 7; i++) {
    float x = 96 + PAD + i * (tw + GAP), y = TY + PAD, h = TH - PAD * 2;
    bool on = i == menu_sel;
    if (on) { x -= 4; y -= 4; h += 8; rect(x, y, tw + 8, h, RED); }
    snprintf(idx, sizeof idx, "%02d", i + 1);
    uint32_t fg = on ? WHITE : INK;
    text(BOLD, 28, idx, x + 24, y + 28, fg);
    text(BOLD, 36, fit(BOLD, 36, MENU[i].title, tw - 48), x + 24, y + 163, fg);
    text(REGULAR, 28, fit(REGULAR, 28, MENU[i].sub, tw - 48), x + 24, y + 206, fg, on ? 1.f : 0.85f);
  }
  if (now_t - toast_t < 1.6) {
    float a = (float)std::min(1.0, (1.6 - (now_t - toast_t)) / 0.4);
    rect(plat::W / 2 - 220, 170, 440, 72, INK, a); text_c(BOLD, 32, toast_msg, plat::W / 2, 194, WHITE, a);
  }
  float x = plat::W - 96;
  x -= text_w(BOLD, 28, "Elegir"); text(BOLD, 28, "Elegir", x, 980, INK); x -= 20;
  keycap(x - 24, 1001, "X", 48, INK, WHITE); x -= 48 + 40;
  x -= text_w(SEMIBOLD, 28, "Volver"); text(SEMIBOLD, 28, "Volver", x, 980, INK); x -= 20;
  rect(x - 48, 977, 48, 48, PAPER); frame(x - 48, 977, 48, 48, 2, INK); text_c(BOLD, 24, "O", x - 24, 991, INK);
}

// ------------------------------------------------------------------ CANCIONES (TV-04)
static const int COLS = 6;
static const float CW = 262, CGAP = 30, ROWH = 390, GRID_Y = 250;

static void songs_input() {
  int n = (int)songs.size(), old = sel;
  if (hit(plat::B_RIGHT)) sel = std::min(n - 1, sel + 1);
  if (hit(plat::B_LEFT)) sel = std::max(0, sel - 1);
  if (hit(plat::B_DOWN)) sel = std::min(n - 1, sel + COLS);
  if (hit(plat::B_UP)) sel = std::max(0, sel - COLS);
  if (hit(plat::B_R1)) sel = std::min(n - 1, sel + COLS * 2);
  if (hit(plat::B_L1)) sel = std::max(0, sel - COLS * 2);
  if (sel != old) { sel_t = now_t; if (preview_for >= 0) { audio::fade_out(0.25f); preview_for = -1; } }
}

struct Game;
static void start_song(int idx);

static void draw_songs() {
  songs_input();
  int n = (int)songs.size();
  if (now_t - sel_t > 0.45) request_decode(sel);
  if (preview_for != sel) {
    if (auto p = decoded(sel)) {
      const Song &s = songs[sel];
      double len = p->frames() / (double)plat::RATE;
      double at = s.preview >= 0 ? s.preview : len * 0.33;
      audio::play(p, at, 0.8f, 0.8f);
      preview_for = sel;
    }
  }
  if (n && hit(plat::B_CROSS)) { start_song(sel); return; }
  if (hit(plat::B_CIRCLE)) { audio::fade_out(0.3f); preview_for = -1; go(S_MENU); return; }

  bg_grid();
  text(REGULAR, 96, "Canciones", 94, 54, INK);
  char cnt[64]; snprintf(cnt, sizeof cnt, "%d canciones", n);
  text_r(SEMIBOLD, 28, cnt, plat::W - 96, 103, GREY2);
  rect(96, 196, plat::W - 192, 2, INK);

  int row = sel / COLS;
  float target = std::max(0.f, (row - 0.5f) * ROWH);
  scroll += (target - scroll) * 0.2f;
  float clip_top = GRID_Y - 10, clip_bot = plat::H - 140;
  int loads = 0;
  for (int i = 0; i < n; i++) {
    int r = i / COLS, c = i % COLS;
    float x = 96 + c * (CW + CGAP), y = GRID_Y + r * ROWH - scroll;
    if (y + CW < clip_top || y > clip_bot) continue;
    bool on = i == sel;
    float lift = on ? -8 : 0;
    Img cv = cover_of(i, loads < 3);
    if (cv) loads++;
    rect(x, y + lift, CW, CW, INK);
    if (cv) image_cover(cv, x, y + lift, CW, CW);
    else text_c(BOLD, 80, songs[i].title.substr(0, 1), x + CW / 2, y + lift + CW / 2 - 52, 0x55504f);
    if (on) frame(x - 8, y + lift - 8, CW + 16, CW + 16, 6, RED);
    float ty = y + CW + 18;
    if (ty + 70 < clip_bot) {
      text(BOLD, 28, fit(BOLD, 28, songs[i].title, CW), x, ty, on ? RED : INK);
      text(REGULAR, 24, fit(REGULAR, 24, songs[i].artist, CW), x, ty + 38, GREY2);
    }
  }
  if (!n) text(REGULAR, 40, "No hay canciones en " + plat::songs_dir(), 96, 300, GREY2);
  rect(0, plat::H - 140, plat::W, 140, PAPER);
  rect(96, plat::H - 140, plat::W - 192, 2, INK);
  if (preview_for == sel) {
    for (int k = 0; k < 4; k++) { float h = 10 + 26 * fabsf(sinf((float)now_t * 6 + k * 1.3f)); rect(96 + k * 12, plat::H - 60 - h, 8, h, RED); }
    text(SEMIBOLD, 28, "Sonando avance", 160, plat::H - 98, INK);
  }
  hints({{"L1 R1", "Página"}, {"O", "Volver"}, {"×", "Cantar"}});
}

// ------------------------------------------------------------------ CANTAR
struct Hit { std::vector<char> slots; double weight_hit = 0; };
static struct Game {
  Song song;
  std::shared_ptr<audio::Pcm> pcm;
  std::vector<std::vector<Hit>> hits;   // [frase][nota]
  double score = 0, slot_value = 0;
  Pitch pitch;
  struct Trail { double t; float midi; };
  std::vector<Trail> trail;
  int line = 0, rated_line = -1;
  std::string rating; double rating_t = -10;
  bool paused = false; int pause_sel = 0;
  bool midi_style = false;
  double first_note = 0, mic_delay = 0.08;
  bool mic_ok = false;
  int golden_total = 0, golden_hit = 0;
  double best_line = 0;
  double line_weight(int li) const { double w = 0; for (auto &n : song.lines[li].notes) w += (n.end - n.start) * n.weight; return w; }
} G;
double score_now() { return G.score; }

static float note_midi(const Note &n) { return G.midi_style ? (float)n.pitch : 60.f + n.pitch; }

static void start_song(int idx) {
  audio::fade_out(0.2f);
  preview_for = -1;
  G = Game();
  G.song = songs[idx];
  go(S_LOADING);
}

static void loading_step() {
  bg_grid();
  text(BOLD, 30, "PREPARANDO", 96, 64, RED);
  rect(96, 112, plat::W - 192, 2, INK);
  text(REGULAR, 92, fit(REGULAR, 92, G.song.title, plat::W - 192).c_str(), 90, 124, INK);
  text(REGULAR, 40, G.song.artist.c_str(), 96, 250, GREY2);
  bool blink = fmod(now_t, 1.0) < 0.7;
  text(BOLD, 34, "Cargando la canción…", 96, plat::H - 108, INK, blink ? 1 : 0.4f);
  if (now_t - screen_t0 < 0.15) return;   // primero que se vea
  auto p = decoded(sel);
  if (!p) p = audio::decode(G.song.audio);
  if (!p || !G.song.load()) { go(S_SONGS); return; }
  G.pcm = p;
  std::vector<int> ps;
  for (auto &l : G.song.lines) for (auto &n : l.notes) ps.push_back(n.pitch);
  std::sort(ps.begin(), ps.end());
  G.midi_style = !ps.empty() && ps[ps.size() / 2] > 35;
  G.hits.resize(G.song.lines.size());
  for (size_t i = 0; i < G.song.lines.size(); i++) {
    for (auto &n : G.song.lines[i].notes) {
      Hit h; h.slots.assign((size_t)std::ceil((n.end - n.start) / 0.04), 0);
      G.hits[i].push_back(h);
      if (n.weight == 2) G.golden_total++;
    }
  }
  G.slot_value = G.song.total_weight > 0 ? 10000.0 / G.song.total_weight : 0;
  G.first_note = G.song.lines.front().start;
  G.mic_ok = plat::mic_open();
  G.pitch.reset();
  { float junk[8192]; while (plat::mic_read(junk, 8192) > 0) {} }
  double from = std::max(0.0, std::min(G.song.start, G.first_note - 4));
  audio::play(G.pcm, from, 0.3f, 1.f);
  go(S_COUNT);
}

// ------------------------------------------------------------------ CUENTA ATRÁS (TV-06)
static const char *TIPS[3] = {
  "En Ajustes puedes calibrar el retraso de tu micro.",
  "Las palabras doradas valen el doble de puntos.",
  "Pulsa Options en cualquier momento para pausar.",
};
static void draw_count() {
  double t = audio::position();
  double left = G.first_note - t;
  if (left <= 0.05 || !audio::playing()) { go(S_SING); return; }
  if (hit(plat::B_CIRCLE)) { audio::stop(); sel_t = now_t; go(S_SONGS); return; }
  rect(0, 0, plat::W, plat::H, RED);
  text(BOLD, 28, "Prepárate", 96, 60, WHITE);
  Img cv = cover_of(sel, true);
  rect(96, 292, 480, 480, INK);
  if (cv) image_cover(cv, 96, 292, 480, 480);
  text(BOLD, 96, fit(BOLD, 96, G.song.title, 700).c_str(), 640, 597, WHITE);
  text(REGULAR, 44, fit(REGULAR, 44, G.song.artist, 700).c_str(), 640, 704, WHITE);
  int n = (int)ceil(std::max(0.0, left));
  if (n > 0 && n <= 9) { char c[4]; snprintf(c, sizeof c, "%d", n); text_c(REGULAR, 480, c, 1404 + 210, 356, WHITE, 0.95f + 0.05f * sinf((float)t * 20)); }
  rect(96, 948, plat::W - 192, 2, WHITE, 0.3f);
  int ti = (int)(now_t / 7) % 3;
  text(BOLD, 36, "Consejo —", 96, 977, WHITE);
  text(REGULAR, 36, TIPS[ti], 295, 977, WHITE);
}

static void score_reading(const PitchReading &r) {
  double t = audio::position() - G.mic_delay - (now_t - r.t);
  if (r.ok) G.trail.push_back({t, r.midi});
  if (G.trail.size() > 600) G.trail.erase(G.trail.begin(), G.trail.begin() + 200);
  if (!r.ok) return;
  for (size_t li = 0; li < G.song.lines.size(); li++) {
    const Line &L = G.song.lines[li];
    if (t < L.start - 0.05 || t > L.end + 0.05) continue;
    for (size_t ni = 0; ni < L.notes.size(); ni++) {
      const Note &n = L.notes[ni];
      if (t < n.start || t >= n.end || !n.weight) continue;
      float d = fmodf(fabsf(r.midi - note_midi(n)), 12.f);
      d = std::min(d, 12 - d);
      float tol = 1.0f + (n.type == 'R' || n.type == 'G' ? 0.6f : 0);
      if (d > tol) continue;
      Hit &h = G.hits[li][ni];
      size_t k = (size_t)((t - n.start) / 0.04);
      if (k < h.slots.size() && !h.slots[k]) {
        h.slots[k] = 1;
        double dur = std::min(0.04, n.end - (n.start + k * 0.04));
        h.weight_hit += dur * n.weight;
        G.score += dur * n.weight * G.slot_value;
      }
    }
  }
}

static const char *rate_line(double pct) {
  return pct > 0.9 ? "¡Perfecto!" : pct > 0.75 ? "¡Genial!" : pct > 0.55 ? "Bien" : pct > 0.3 ? "Regular" : "Fallo";
}

static void draw_sing() {
  const Song &S = G.song;
  if (hit(plat::B_OPTIONS) && !G.paused) { G.paused = true; G.pause_sel = 0; audio::pause(true); }
  else if (G.paused) {
    if (hit(plat::B_UP)) G.pause_sel = (G.pause_sel + 2) % 3;
    if (hit(plat::B_DOWN)) G.pause_sel = (G.pause_sel + 1) % 3;
    if (hit(plat::B_OPTIONS) || hit(plat::B_CIRCLE) || (hit(plat::B_CROSS) && G.pause_sel == 0)) { G.paused = false; audio::pause(false); }
    else if (hit(plat::B_CROSS) && G.pause_sel == 1) { int i = sel; audio::stop(); start_song(i); return; }
    else if (hit(plat::B_CROSS) && G.pause_sel == 2) { audio::stop(); sel_t = now_t; go(S_SONGS); return; }
  }
  double t = audio::position();
  if (!G.paused) {
    static float buf[16384];
    int got = plat::mic_read(buf, 16384);
    if (got > 0) for (auto &r : G.pitch.feed(buf, got, plat::mic_rate(), now_t)) score_reading(r);
    static const bool bot = getenv("GRAMOLA_BOT") != nullptr;   // pruebas: canta solo
    static double bot_next = 0;
    if (bot && now_t >= bot_next) {
      bot_next = now_t + 0.04;
      for (auto &l : S.lines) for (auto &n : l.notes)
        if (t >= n.start && t < n.end && fmod(t * 7.3, 1.0) > 0.12) score_reading({now_t, note_midi(n) + 12 + (float)sin(t * 9) * 0.3f, 1, true});
    }
  }
  while (G.line + 1 < (int)S.lines.size() && t > S.lines[G.line].end + 0.3 && t > S.lines[G.line + 1].start - 2.5) G.line++;
  for (int li = G.rated_line + 1; li < (int)S.lines.size() && t > S.lines[li].end + 0.25; li++) {
    double lw = G.line_weight(li), hw = 0;
    for (size_t ni = 0; ni < S.lines[li].notes.size(); ni++) {
      hw += G.hits[li][ni].weight_hit;
      const Note &n = S.lines[li].notes[ni];
      if (n.weight == 2 && G.hits[li][ni].weight_hit > (n.end - n.start) * 2 * 0.6) G.golden_hit++;
    }
    double pct = lw > 0 ? hw / lw : 0;
    G.best_line = std::max(G.best_line, pct);
    G.rating = rate_line(pct); G.rating_t = now_t; G.rated_line = li;
  }
  if (!G.paused && (t > S.lines.back().end + 3 || !audio::playing())) {
    audio::fade_out(1.5f);
    audio::sfx(applause, 0.9f);
    go(S_RESULTS);
    return;
  }

  bg_grid();
  sing_header(S);
  if (now_t - G.rating_t < 1.6) {
    float a = (float)std::min(1.0, (1.6 - (now_t - G.rating_t)) / 0.4);
    text_r(BOLD, 34, G.rating, 1404 + 390, 172, RED, a);
  }
  if (!G.mic_ok) text_r(SEMIBOLD, 24, "Sin micro: conecta un micro USB o unos cascos al mando", 1404 - 20, 172, RED);

  const float LX = 96, LY = 210, LW = plat::W - 192, LH = 540;
  rect(LX, LY, LW, LH, WHITE);
  rect(LX, LY, LW, 2, INK); rect(LX, LY + LH - 2, LW, 2, INK);
  const Line &L = S.lines[G.line];
  float pmin = 1e9, pmax = -1e9;
  for (auto &n : L.notes) if (n.weight || n.type == 'F') { pmin = std::min(pmin, note_midi(n)); pmax = std::max(pmax, note_midi(n)); }
  if (pmin > pmax) { pmin = 60; pmax = 72; }
  float mid = (pmin + pmax) / 2, span = std::max(10.f, pmax - pmin + 4);
  float rowh = (LH - 60) / span;
  auto yof = [&](float m) { return LY + LH / 2 - (m - mid) * rowh; };
  for (int k = 1; k < 8; k++) rect(LX, LY + k * LH / 8, LW, 1, 0xf0eeee);
  double l0 = L.start - 0.4, l1 = L.end + 0.4;
  auto xof = [&](double tt) { return (float)(LX + 40 + (tt - l0) / (l1 - l0) * (LW - 80)); };
  float nh = std::max(26.f, std::min(44.f, rowh * 0.9f));
  for (size_t ni = 0; ni < L.notes.size(); ni++) {
    const Note &n = L.notes[ni];
    float x0 = xof(n.start), x1 = xof(n.end), y = yof(note_midi(n)) - nh / 2;
    bool gold = n.weight == 2, free_ = n.type == 'F';
    rect(x0, y, x1 - x0, nh, gold ? 0xfbe6a8 : free_ ? 0xf6f5f5 : 0xe9e7e7);
    const Hit &h = G.hits[G.line][ni];
    for (size_t k = 0; k < h.slots.size(); k++)
      if (h.slots[k]) { float a = xof(n.start + k * 0.04), b = xof(std::min(n.end, n.start + (k + 1) * 0.04)); rect(a, y + 3, b - a + 0.6f, nh - 6, gold ? GOLD : PLAYER); }
    frame(x0, y, x1 - x0, nh, 2, gold ? 0xb98a00 : 0x4a4645);
  }
  for (auto &tr : G.trail) {
    if (tr.t < l0 || tr.t > l1) continue;
    float ref = mid;
    for (auto &n : L.notes) if (tr.t >= n.start - 0.1 && tr.t < n.end + 0.1) { ref = note_midi(n); break; }
    float m = tr.midi + roundf((ref - tr.midi) / 12) * 12;
    rect(xof(tr.t) - 5, yof(m) - 5, 10, 10, PLAYER, 0.9f);
  }
  if (t >= l0 && t <= l1) rect(xof(t) - 2, LY + 2, 4, LH - 4, RED, 0.85f);

  const float KY = 800;
  rect(0, KY, plat::W, 200, INK);
  float total = 0;
  for (auto &n : L.notes) total += text_w(BOLD, 66, n.text);
  float x = (plat::W - total) / 2;
  if (t < L.start - 0.1) {
    float k = (float)std::max(0.0, std::min(1.0, (L.start - t) / 2.0));
    rect(x - 40 - 200 * k, KY + 56, 200 * k, 26, RED);
  }
  for (auto &n : L.notes) {
    uint32_t c = t >= n.start ? (n.weight == 2 ? GOLD : RED) : WHITE;
    x += text(BOLD, 66, n.text, x, KY + 26, c);
  }
  if (G.line + 1 < (int)S.lines.size()) {
    std::string nx;
    for (auto &n : S.lines[G.line + 1].notes) nx += n.text;
    text_c(REGULAR, 40, nx, plat::W / 2, KY + 120, 0x9b9797);
  }
  double len = audio::length() > 0 ? audio::length() : 1;
  rect(96, plat::H - 50, plat::W - 192, 6, TRACK);
  rect(96, plat::H - 50, (float)((plat::W - 192) * std::min(1.0, t / len)), 6, INK);
  rect(plat::W - 96 - 200, plat::H - 74, 200 * G.pitch.level(), 4, PLAYER);

  if (G.paused) {
    rect(0, 0, plat::W, plat::H, INK, 0.6f);
    const float CX = 580, CY = 255, CW2 = 760, CH2 = 570;
    rect(CX, CY, CW2, CH2, PAPER);
    text(REGULAR, 96, "Pausa", CX + 48, CY + 44, INK);
    const char *opts[3] = {"Seguir", "Reiniciar canción", "Salir"};
    for (int i = 0; i < 3; i++) {
      float y = CY + 170 + i * 100, w = CW2 - 64, h = 88, x0 = CX + 32;
      bool on = i == G.pause_sel;
      if (on) rect(x0, y, w, h, RED); else frame(x0, y, w, h, 2, INK);
      text(BOLD, 40, opts[i], x0 + 24, y + 13, on ? WHITE : INK);
      if (on) text_r(BOLD, 32, ">", x0 + w - 24, y + 19, WHITE);
    }
  }
}

// ------------------------------------------------------------------ RESULTADOS (TV-12)
static int res_sel = 0;
static const char *rank_of(double s) {
  return s >= 9200 ? "leyenda" : s >= 8000 ? "leyenda" : s >= 6500 ? "estrella" : s >= 5000 ? "promesa" : s >= 3000 ? "aficionado" : "cantante de ducha";
}
static const char *RANK_CAP[6] = {"Cantante de ducha", "Aficionado", "Promesa", "Estrella", "Leyenda", "Mito"};
static void draw_results() {
  double t = now_t - screen_t0;
  if (hit(plat::B_LEFT)) res_sel = std::max(0, res_sel - 1);
  if (hit(plat::B_RIGHT)) res_sel = std::min(2, res_sel + 1);
  if (t > 1 && hit(plat::B_CROSS)) {
    audio::stop();
    if (res_sel == 0) { sel = std::min((int)songs.size() - 1, sel + 1); sel_t = now_t; go(S_SONGS); }
    else if (res_sel == 1) start_song(sel);
    else go(S_MENU);
    return;
  }
  bg_grid();
  text(REGULAR, 96, "Resultados", 96, 54, INK);
  text_r(BOLD, 32, G.song.title.c_str(), plat::W - 96, 62, INK);
  text_r(REGULAR, 28, G.song.artist.c_str(), plat::W - 96, 103, GREY2);

  double shown = G.score * std::min(1.0, t / 1.5);
  int blocks = G.score >= 9200 ? 5 : G.score >= 8000 ? 4 : G.score >= 6500 ? 3 : G.score >= 5000 ? 2 : G.score >= 3000 ? 1 : 0;
  char title[160]; snprintf(title, sizeof title, "Jugador 1, %s.", rank_of(G.score));
  text(BOLD, 72, title, 96, 187, INK);

  rect(96, 290, plat::W - 192, 180, WHITE);
  rect(96, 290, 12, 180, PLAYER);
  text(REGULAR, 56, "1", 112, 350, INK);
  char det[200];
  snprintf(det, sizeof det, "%d %% · * %d/%d · mejor frase %d %%", (int)std::min(100.0, shown / 100), G.golden_hit, G.golden_total, (int)(G.best_line * 100 + 0.5));
  text(BOLD, 28, "JUGADOR 1", 220, 338, INK);
  text(REGULAR, 28, det, 220, 386, GREY2);
  rect(804, 363, 452, 36, TRACK);
  rect(804, 363, (float)(452 * std::min(1.0, shown / 10000)), 36, PLAYER);
  char sc[32]; snprintf(sc, sizeof sc, "%d", (int)(shown + 0.5));
  text(REGULAR, 96, sc, 1292, 329, INK);
  for (int k = 0; k < 6; k++) rect(1544 + k * 24, 353, 20, 20, k <= blocks ? INK : 0xd7d3d3);
  text(BOLD, 28, RANK_CAP[blocks], 1544, 379, INK);

  const char *b[3] = {"Otra canción", "Repetir", "Menú"};
  for (int i = 0; i < 3; i++) {
    float x = 98 + i * 577, y = 928, w = 560, h = 96;
    bool on = i == res_sel;
    if (on) rect(x, y, w, h, RED); else frame(x, y, w, h, 2, INK);
    text(BOLD, 40, b[i], x + 32, y + 17, on ? WHITE : INK);
    if (on && i == 0) text(BOLD, 40, ">", x + w - 70, y + 17, WHITE);
  }
}

// ------------------------------------------------------------------ bucle
int main() {
  if (!plat::init()) return 1;
  if (!gfx::init()) { plat::log("sin recursos en %s", plat::assets().c_str()); return 1; }
  audio::init();
  logo_white = load(plat::assets() + "images/logo-blanco.png");
  logo_ink = load(plat::assets() + "images/logo-tinta.png");
  nuvola_ink = load(plat::assets() + "images/nuvola-tinta.png");
  nuvola_white = load(plat::assets() + "images/nuvola-blanco.png");
  nuvola_original = load(plat::assets() + "images/nuvola-original.png");
  {   // disco rojo con borde suavizado, para el círculo del arranque (el sombreador de la PS4 no tiñe: va en su color)
    const int N = 1024; std::vector<uint8_t> px(N * N * 4);
    for (int y = 0; y < N; y++) for (int x = 0; x < N; x++) {
      float d = sqrtf((x + 0.5f - N / 2.f) * (x + 0.5f - N / 2.f) + (y + 0.5f - N / 2.f) * (y + 0.5f - N / 2.f));
      float al = std::max(0.f, std::min(1.f, N / 2.f - d));
      uint8_t *q = &px[(y * N + x) * 4]; q[0] = 0xec; q[1] = 0x30; q[2] = 0x13; q[3] = (uint8_t)(al * 255);
    }
    disco_rojo = from_rgba(N, N, px.data());
  }
  songs = scan_songs(plat::songs_dir());
  plat::log("%d canciones en %s", (int)songs.size(), plat::songs_dir().c_str());
  covers.resize(songs.size()); cover_tried.assign(songs.size(), 0);
  now_t = plat::now();
  go(S_BOOT);
  std::thread([]() {
    menu_music = audio::decode(plat::assets() + "audio/menu.mp3");
    applause = audio::decode(plat::assets() + "audio/aplausos.mp3");
  }).detach();
  bool menu_started = false;
  while (true) {
    now_t = plat::now();
    if (!plat::frame_begin(PAPER)) break;
    read_input();
    if (prev_b & plat::B_QUIT) break;
    bool want_music = screen == S_WELCOME || screen == S_MENU || screen == S_SONGS;
    if (want_music && menu_music && !menu_started) { audio::play(menu_music, 0, 1.2f, 0.55f); menu_started = true; }
    if (!want_music) menu_started = false;
    switch (screen) {
      case S_BOOT: draw_boot(); break;
      case S_WELCOME: draw_welcome(); break;
      case S_MENU: draw_menu(); break;
      case S_SONGS: draw_songs(); break;
      case S_LOADING: loading_step(); break;
      case S_COUNT: draw_count(); break;
      case S_SING: draw_sing(); break;
      case S_RESULTS: draw_results(); break;
    }
    gfx::end_frame();
    plat::frame_end();
  }
  plat::shutdown();
  return 0;
}
