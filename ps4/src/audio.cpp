#include "audio.h"
#include "plat.h"
#include <cmath>
#include <cstring>
#include <mutex>

#define MINIMP3_IMPLEMENTATION
#include "../third_party/minimp3.h"
#include "../third_party/minimp3_ex.h"

namespace audio {

static std::mutex mx;
static std::shared_ptr<Pcm> music;
static double pos = 0;          // en tramas
static bool paused = false;
static float vol = 1, gain = 1, gain_step = 0;   // gain: fundido
static bool stop_after_fade = false;
struct Voice { std::shared_ptr<Pcm> p; size_t at; float v; };
static std::vector<Voice> sfxs;
static std::atomic<double> heard{0};

static void fill(int16_t *out, int frames) {
  std::lock_guard<std::mutex> g(mx);
  memset(out, 0, frames * 4);
  if (music && !paused) {
    const size_t n = music->frames();
    for (int i = 0; i < frames; i++) {
      size_t k = (size_t)pos;
      if (k >= n) break;
      gain += gain_step;
      if (gain >= 1) { gain = 1; if (gain_step > 0) gain_step = 0; }
      if (gain <= 0) { gain = 0; gain_step = 0; if (stop_after_fade) { music.reset(); stop_after_fade = false; break; } }
      float k2 = vol * gain;
      out[i * 2] = (int16_t)(music->s[k * 2] * k2);
      out[i * 2 + 1] = (int16_t)(music->s[k * 2 + 1] * k2);
      pos += 1;
    }
  }
  for (auto it = sfxs.begin(); it != sfxs.end();) {
    for (int i = 0; i < frames && it->at < it->p->frames(); i++, it->at++) {
      for (int c = 0; c < 2; c++) {
        int v = out[i * 2 + c] + (int)(it->p->s[it->at * 2 + c] * it->v);
        out[i * 2 + c] = (int16_t)std::max(-32768, std::min(32767, v));
      }
    }
    if (it->at >= it->p->frames()) it = sfxs.erase(it); else ++it;
  }
  heard = music ? pos / plat::RATE - plat::audio_latency() : 0;
}

void init() { plat::audio_start(fill); }

std::shared_ptr<Pcm> decode(const std::string &path) {
  mp3dec_t d;
  mp3dec_file_info_t info{};
  if (mp3dec_load(&d, path.c_str(), &info, nullptr, nullptr) || !info.samples || !info.hz) { std::free(info.buffer); return nullptr; }
  auto p = std::make_shared<Pcm>();
  const int ch = info.channels;
  const size_t inf = info.samples / ch;
  const double k = (double)info.hz / plat::RATE;
  const size_t outf = (size_t)(inf / k);
  p->s.resize(outf * 2);
  for (size_t i = 0; i < outf; i++) {
    double x = i * k; size_t a = (size_t)x; double f = x - a;
    size_t b = std::min(a + 1, inf - 1);
    for (int c = 0; c < 2; c++) {
      int cc = ch > 1 ? c : 0;
      double v = info.buffer[a * ch + cc] * (1 - f) + info.buffer[b * ch + cc] * f;
      p->s[i * 2 + c] = (int16_t)v;
    }
  }
  std::free(info.buffer);
  return p;
}

void play(std::shared_ptr<Pcm> p, double from_s, float fade_in, float volume) {
  std::lock_guard<std::mutex> g(mx);
  music = p; pos = std::max(0.0, from_s) * plat::RATE; paused = false; vol = volume; stop_after_fade = false;
  if (fade_in > 0) { gain = 0; gain_step = 1.f / (fade_in * plat::RATE); } else { gain = 1; gain_step = 0; }
}

void fade_out(float s) {
  std::lock_guard<std::mutex> g(mx);
  if (!music) return;
  gain_step = -1.f / (std::max(0.01f, s) * plat::RATE); stop_after_fade = true;
}

void stop() { std::lock_guard<std::mutex> g(mx); music.reset(); }
void pause(bool p) { std::lock_guard<std::mutex> g(mx); paused = p; }
bool playing() { std::lock_guard<std::mutex> g(mx); return music && pos < music->frames(); }
double position() { return heard; }
double length() { std::lock_guard<std::mutex> g(mx); return music ? music->frames() / (double)plat::RATE : 0; }
void set_volume(float v) { std::lock_guard<std::mutex> g(mx); vol = v; }
void sfx(std::shared_ptr<Pcm> p, float v) { if (!p) return; std::lock_guard<std::mutex> g(mx); sfxs.push_back({p, 0, v}); }

}  // namespace audio
