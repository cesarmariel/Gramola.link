// Gramola nativa (PS4 / Mac): arranque, canciones, cantar con el micro de la consola, resultados.
// Todo en la consola: las canciones van en la carpeta de canciones (en la PS4, /data/gramola/canciones).
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

// ------------------------------------------------------------------ estado general
enum Screen { S_BOOT, S_SONGS, S_LOADING, S_SING, S_RESULTS };
static Screen screen = S_BOOT;
static double screen_t0 = 0;
static std::vector<Song> songs;
static int sel = 0;
static float scroll = 0;
static Img logo_white, logo_ink, nuvola_ink, nuvola_white;
static std::shared_ptr<audio::Pcm> menu_music, applause;
static const uint32_t PLAYER = 0xff4fa3;   // color del jugador 1 (rosa del diseño)
static double now_t = 0;

static void go(Screen s) { screen = s; screen_t0 = now_t; }

// ------------------------------------------------------------------ mando: pulsaciones con repetición
static uint32_t prev_b = 0, pressed = 0;
static double held_since[32];
static void read_input() {
  uint32_t b = plat::buttons();
  pressed = b & ~prev_b;
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
    for (;;) {
      std::lock_guard<std::mutex> g(dec_mx);
      dec_done = p; dec_done_idx = idx; dec_busy = -1;
      break;
    }
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

// ------------------------------------------------------------------ ARRANQUE
static void draw_boot() {
  double t = now_t - screen_t0;
  if (t < 2.4) {   // nuvola
    float a = (float)std::min(1.0, std::min(t / 0.6, (2.4 - t) / 0.6));
    rect(0, 0, plat::W, plat::H, PAPER);
    if (nuvola_ink) { float w = 420, h = w * nuvola_ink.h / nuvola_ink.w; image(nuvola_ink, (plat::W - w) / 2, (plat::H - h) / 2, w, h, a); }
    else text_c(BOLD, 90, "nuvola", plat::W / 2, plat::H / 2 - 60, INK, a);
    return;
  }
  rect(0, 0, plat::W, plat::H, RED);
  float a = (float)std::min(1.0, (t - 2.4) / 0.5);
  text(BOLD, 34, "KARAOKE EN CASA", 96, 70, INK, a);
  text_r(BOLD, 34, "PS4", plat::W - 96, 70, INK, a);
  if (logo_white) { float w = 1430, h = w * logo_white.h / logo_white.w; image(logo_white, 96, 500 - h / 2 + 60, w, h, a); }
  if (nuvola_ink) { float w = 84, h = w * nuvola_ink.h / nuvola_ink.w; image(nuvola_ink, plat::W - 96 - w, 980 - h / 2, w, h, a); }
  bool blink = fmod(t, 1.2) < 0.85;
  if (songs.empty()) {
    text(BOLD, 34, "No hay canciones.", 96, 930, INK, a);
    text(REGULAR, 28, ("Cópialas por FTP en " + plat::songs_dir() + " (una carpeta por canción) y vuelve a abrir Gramola.").c_str(), 96, 980, INK, a);
  } else if (t > 3.2) {
    text(BOLD, 40, "Pulsa × para empezar", 96, 960, INK, blink ? a : a * 0.35f);
  }
  if (t > 3.2 && !songs.empty() && (hit(plat::B_CROSS) || hit(plat::B_OPTIONS))) { audio::fade_out(0.4f); go(S_SONGS); }
}

// ------------------------------------------------------------------ CANCIONES
static const int COLS = 6;
static const float CW = 262, CGAP = 30, ROWH = 390, GRID_Y = 250;
static double sel_t = 0;
static int preview_for = -1;

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
  // avance: medio segundo quieto en una canción → se decodifica y suena
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
  if (hit(plat::B_CROSS)) { start_song(sel); return; }
  if (hit(plat::B_CIRCLE)) { audio::fade_out(0.3f); preview_for = -1; go(S_BOOT); screen_t0 = now_t - 2.4; audio::play(menu_music, 0, 1.f, 0.6f); return; }

  bg_grid();
  text(BOLD, 30, "GRAMOLA", 96, 64, RED);
  char cnt[64]; snprintf(cnt, sizeof cnt, "%d canciones", n);
  text_r(BOLD, 30, cnt, plat::W - 96, 64, GREY);
  rect(96, 112, plat::W - 192, 2, INK);
  text(REGULAR, 92, "Elige canción", 90, 124, INK);

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
      text(REGULAR, 24, fit(REGULAR, 24, songs[i].artist, CW), x, ty + 38, GREY);
    }
  }
  // barra inferior
  rect(0, plat::H - 140, plat::W, 140, PAPER);
  rect(96, plat::H - 140, plat::W - 192, 2, INK);
  if (preview_for == sel) {
    for (int k = 0; k < 4; k++) { float h = 10 + 26 * fabsf(sinf((float)now_t * 6 + k * 1.3f)); rect(96 + k * 12, plat::H - 60 - h, 8, h, RED); }
    text(BOLD, 30, "Sonando avance", 160, plat::H - 98, INK);
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

static float note_midi(const Note &n) { return G.midi_style ? (float)n.pitch : 60.f + n.pitch; }

static void start_song(int idx) {
  audio::fade_out(0.2f);
  preview_for = -1;
  G = Game();
  G.song = songs[idx];
  go(S_LOADING);
}

static void loading_step() {
  // Pantalla de carga: se dibuja un fotograma y luego se decodifica (si el avance no lo había hecho ya)
  bg_grid();
  text(BOLD, 30, "PREPARANDO", 96, 64, RED);
  rect(96, 112, plat::W - 192, 2, INK);
  text(REGULAR, 92, fit(REGULAR, 92, G.song.title, plat::W - 192).c_str(), 90, 124, INK);
  text(REGULAR, 40, G.song.artist.c_str(), 96, 250, GREY);
  bool blink = fmod(now_t, 1.0) < 0.7;
  text(BOLD, 34, "Cargando la canción…", 96, plat::H - 108, INK, blink ? 1 : 0.4f);
  if (now_t - screen_t0 < 0.15) return;   // primero que se vea
  auto p = decoded(sel);
  if (!p) p = audio::decode(G.song.audio);
  if (!p || !G.song.load()) { go(S_SONGS); return; }
  G.pcm = p;
  // ¿tonos en numeración MIDI (60 = Do4) o UltraStar (0 = Do4)?
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
  go(S_SING);
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
  // pausa
  if (hit(plat::B_OPTIONS) && !G.paused) { G.paused = true; G.pause_sel = 0; audio::pause(true); }
  else if (G.paused) {
    if (hit(plat::B_UP)) G.pause_sel = (G.pause_sel + 2) % 3;
    if (hit(plat::B_DOWN)) G.pause_sel = (G.pause_sel + 1) % 3;
    if (hit(plat::B_OPTIONS) || hit(plat::B_CIRCLE) || (hit(plat::B_CROSS) && G.pause_sel == 0)) { G.paused = false; audio::pause(false); }
    else if (hit(plat::B_CROSS) && G.pause_sel == 1) { int i = sel; audio::stop(); start_song(i); return; }
    else if (hit(plat::B_CROSS) && G.pause_sel == 2) { audio::stop(); sel_t = now_t; go(S_SONGS); return; }
  }
  double t = audio::position();
  // micro → puntos
  if (!G.paused) {
    static float buf[16384];
    int got = plat::mic_read(buf, 16384);
    if (got > 0) for (auto &r : G.pitch.feed(buf, got, plat::mic_rate(), now_t)) score_reading(r);
    static const bool bot = getenv("GRAMOLA_BOT") != nullptr;   // pruebas: canta solo, con algún fallo
    static double bot_next = 0;
    if (bot && now_t >= bot_next) {
      bot_next = now_t + 0.04;
      double tt = t;
      for (auto &l : S.lines) for (auto &n : l.notes)
        if (tt >= n.start && tt < n.end && fmod(tt * 7.3, 1.0) > 0.12) score_reading({now_t, note_midi(n) + 12 + (float)sin(tt * 9) * 0.3f, 1, true});
    }
  }
  // frase actual: la que está sonando, o la siguiente
  while (G.line + 1 < (int)S.lines.size() && t > S.lines[G.line].end + 0.3 && t > S.lines[G.line + 1].start - 2.5) G.line++;
  // valoración de la frase al terminarla
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
  // fin
  if (!G.paused && (t > S.lines.back().end + 3 || !audio::playing())) {
    audio::fade_out(1.5f);
    audio::sfx(applause, 0.9f);
    go(S_RESULTS);
    return;
  }

  bg_grid();
  // cabecera
  Img cv = cover_of(sel, true);
  rect(96, 56, 120, 120, INK);
  if (cv) image_cover(cv, 96, 56, 120, 120);
  text(BOLD, 46, fit(BOLD, 46, S.title, 900).c_str(), 248, 66, INK);
  text(REGULAR, 32, fit(REGULAR, 32, S.artist, 900).c_str(), 248, 124, GREY);
  float bx = plat::W - 96 - 420;
  rect(bx, 56, 420, 120, WHITE); rect(bx, 56, 10, 120, PLAYER);
  text(BOLD, 26, "JUGADOR 1", bx + 34, 70, INK);
  char sc[32]; snprintf(sc, sizeof sc, "%d", (int)(G.score + 0.5));
  text(REGULAR, 64, sc, bx + 30, 98, INK);
  if (now_t - G.rating_t < 1.6) {
    float a = (float)std::min(1.0, (1.6 - (now_t - G.rating_t)) / 0.4);
    text_r(BOLD, 36, G.rating, bx + 400, 120, RED, a);
  }
  if (!G.mic_ok) text_r(BOLD, 26, "Sin micro: conecta un micro USB o unos cascos al mando", bx - 30, 130, RED);

  // carril con las notas de la frase
  const float LX = 96, LY = 240, LW = plat::W - 192, LH = 520;
  rect(LX, LY, LW, LH, WHITE);
  rect(LX, LY, LW, 2, INK); rect(LX, LY + LH - 2, LW, 2, INK);
  const Line &L = S.lines[G.line];
  float pmin = 1e9, pmax = -1e9;
  for (auto &n : L.notes) if (n.weight || n.type == 'F') { pmin = std::min(pmin, note_midi(n)); pmax = std::max(pmax, note_midi(n)); }
  if (pmin > pmax) { pmin = 60; pmax = 72; }
  float mid = (pmin + pmax) / 2, span = std::max(10.f, pmax - pmin + 4);
  float rowh = (LH - 60) / span;
  auto yof = [&](float m) { return LY + LH / 2 - (m - mid) * rowh; };
  for (int k = 1; k < 8; k++) rect(LX, LY + k * LH / 8, LW, 1, LINE);
  double l0 = L.start - 0.4, l1 = L.end + 0.4;
  auto xof = [&](double tt) { return (float)(LX + 40 + (tt - l0) / (l1 - l0) * (LW - 80)); };
  float nh = std::max(26.f, std::min(44.f, rowh * 0.9f));
  for (size_t ni = 0; ni < L.notes.size(); ni++) {
    const Note &n = L.notes[ni];
    float x0 = xof(n.start), x1 = xof(n.end), y = yof(note_midi(n)) - nh / 2;
    bool gold = n.weight == 2, free_ = n.type == 'F';
    rect(x0, y, x1 - x0, nh, gold ? 0xfbe6a8 : free_ ? 0xf6f5f5 : 0xe9e7e7);
    // lo cantado bien, del color del jugador
    const Hit &h = G.hits[G.line][ni];
    for (size_t k = 0; k < h.slots.size(); k++)
      if (h.slots[k]) { float a = xof(n.start + k * 0.04), b = xof(std::min(n.end, n.start + (k + 1) * 0.04)); rect(a, y + 3, b - a + 0.6f, nh - 6, gold ? GOLD : PLAYER); }
    frame(x0, y, x1 - x0, nh, 2, gold ? 0xb98a00 : 0x4a4645);
  }
  // estela de la voz (a la octava de la nota que toca)
  for (auto &tr : G.trail) {
    if (tr.t < l0 || tr.t > l1) continue;
    float ref = mid;
    for (auto &n : L.notes) if (tr.t >= n.start - 0.1 && tr.t < n.end + 0.1) { ref = note_midi(n); break; }
    float m = tr.midi + roundf((ref - tr.midi) / 12) * 12;
    rect(xof(tr.t) - 5, yof(m) - 5, 10, 10, PLAYER, 0.9f);
  }
  // cabezal
  if (t >= l0 && t <= l1) rect(xof(t) - 2, LY + 2, 4, LH - 4, RED, 0.85f);
  // cuenta atrás antes de la primera frase
  double left = G.first_note - t;
  if (left > 0 && left < 3.2) {
    char c[4]; snprintf(c, sizeof c, "%d", (int)ceil(left));
    text(BOLD, 220, c, LX + 40, LY + LH / 2 - 150, RED, (float)std::min(1.0, fmod(left, 1.0) * 3 + 0.2));
  }

  // letra
  const float KY = 800;
  rect(0, KY, plat::W, 200, INK);
  float total = 0;
  for (auto &n : L.notes) total += text_w(BOLD, 66, n.text);
  float x = (plat::W - total) / 2;
  if (t < L.start - 0.1) {   // barra que se vacía antes de que empiece la frase
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
  // progreso
  double len = audio::length() > 0 ? audio::length() : 1;
  rect(96, plat::H - 50, plat::W - 192, 6, LIGHT);
  rect(96, plat::H - 50, (float)((plat::W - 192) * std::min(1.0, t / len)), 6, INK);
  // nivel del micro
  rect(plat::W - 96 - 200, plat::H - 74, 200 * G.pitch.level(), 4, PLAYER);

  if (G.paused) {
    rect(0, 0, plat::W, plat::H, INK, 0.75f);
    text_c(REGULAR, 110, "Pausa", plat::W / 2, 250, WHITE);
    const char *opts[3] = {"Continuar", "Volver a empezar", "Elegir otra canción"};
    for (int i = 0; i < 3; i++) {
      float y = 450 + i * 120;
      if (i == G.pause_sel) rect(plat::W / 2 - 380, y - 14, 760, 96, RED);
      else frame(plat::W / 2 - 380, y - 14, 760, 96, 3, WHITE);
      text_c(BOLD, 44, opts[i], plat::W / 2, y + 6, WHITE);
    }
  }
}

// ------------------------------------------------------------------ RESULTADOS
static int res_sel = 0;
static const char *rank_of(double s) {
  return s >= 9200 ? "Mito" : s >= 8000 ? "Leyenda" : s >= 6500 ? "Estrella" : s >= 5000 ? "Promesa" : s >= 3000 ? "Aficionado" : "Cantante de ducha";
}
static void draw_results() {
  double t = now_t - screen_t0;
  if (hit(plat::B_LEFT)) res_sel = std::max(0, res_sel - 1);
  if (hit(plat::B_RIGHT)) res_sel = std::min(1, res_sel + 1);
  if (t > 1 && hit(plat::B_CROSS)) {
    audio::stop();
    if (res_sel == 0) { sel_t = now_t; go(S_SONGS); } else start_song(sel);
    return;
  }
  bg_grid();
  text(REGULAR, 110, "Resultados", 90, 50, INK);
  text_r(BOLD, 34, G.song.title.c_str(), plat::W - 96, 70, INK);
  text_r(REGULAR, 30, G.song.artist.c_str(), plat::W - 96, 118, GREY);
  rect(96, 196, plat::W - 192, 2, INK);
  // la puntuación sube en 1,5 s
  double shown = G.score * std::min(1.0, t / 1.5);
  char sc[32]; snprintf(sc, sizeof sc, "%d", (int)(shown + 0.5));
  rect(96, 260, plat::W - 192, 300, WHITE); rect(96, 260, 14, 300, PLAYER);
  text(BOLD, 34, "JUGADOR 1", 150, 290, INK);
  text(REGULAR, 200, sc, 140, 320, INK);
  text_r(BOLD, 64, rank_of(G.score), plat::W - 140, 330, RED, (float)std::min(1.0, std::max(0.0, t - 1.4) / 0.4));
  int blocks = G.score >= 9200 ? 6 : G.score >= 8000 ? 5 : G.score >= 6500 ? 4 : G.score >= 5000 ? 3 : G.score >= 3000 ? 2 : 1;
  for (int k = 0; k < 6; k++) rect(plat::W - 140 - (6 - k) * 46, 420, 36, 36, k < blocks ? INK : LIGHT);
  char det[160];
  snprintf(det, sizeof det, "Doradas %d/%d  ·  mejor frase %d %%", G.golden_hit, G.golden_total, (int)(G.best_line * 100 + 0.5));
  text(REGULAR, 34, det, 150, 500, GREY);
  // barra
  rect(96, 600, plat::W - 192, 28, LIGHT);
  rect(96, 600, (float)((plat::W - 192) * std::min(1.0, shown / 10000)), 28, PLAYER);
  // botones
  const char *b[2] = {"Otra canción", "Repetir"};
  for (int i = 0; i < 2; i++) {
    float x = 96 + i * 600, y = 760, w = 580, h = 110;
    if (i == res_sel) rect(x, y, w, h, RED); else frame(x, y, w, h, 3, INK);
    text(BOLD, 44, b[i], x + 36, y + 30, i == res_sel ? WHITE : INK);
  }
  hints({{"←→", "Elegir"}, {"×", "Aceptar"}});
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
    if (!menu_started && menu_music && screen == S_BOOT && now_t - screen_t0 > 2.0) { audio::play(menu_music, 0, 1.5f, 0.6f); menu_started = true; }
    switch (screen) {
      case S_BOOT: draw_boot(); break;
      case S_SONGS: draw_songs(); break;
      case S_LOADING: loading_step(); break;
      case S_SING: draw_sing(); break;
      case S_RESULTS: draw_results(); break;
    }
    gfx::end_frame();
    plat::frame_end();
  }
  plat::shutdown();
  return 0;
}
