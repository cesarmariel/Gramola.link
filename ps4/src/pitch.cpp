#include "pitch.h"
#include <algorithm>
#include <cmath>

static bool yin(const float *buf, int n, int rate, float &hz, float &clarity) {
  const float minHz = 70, maxHz = 1100, thr = 0.2f;
  const int W = n / 2;
  const int tauMin = (int)(rate / maxHz), tauMax = std::min((int)(rate / minHz), W - 1);
  static std::vector<float> d;
  d.assign(tauMax + 2, 0);
  for (int tau = 1; tau <= tauMax; tau++) {
    float s = 0;
    for (int i = 0; i < W; i++) { float x = buf[i] - buf[i + tau]; s += x * x; }
    d[tau] = s;
  }
  float run = 0; d[0] = 1;
  for (int tau = 1; tau <= tauMax; tau++) { run += d[tau]; d[tau] = run > 0 ? d[tau] * tau / run : 1; }
  int tau = -1;
  for (int t = tauMin; t <= tauMax; t++)
    if (d[t] < thr) { while (t + 1 <= tauMax && d[t + 1] < d[t]) t++; tau = t; break; }
  if (tau < 0) {   // con ruido: el mínimo global si es razonablemente claro, prefiriendo el periodo corto
    int best = tauMin;
    for (int t = tauMin + 1; t <= tauMax; t++) if (d[t] < d[best]) best = t;
    if (d[best] < 0.4f) {
      tau = best;
      float lim = d[best] * 1.2f + 0.03f;
      for (int t = tauMin + 1; t < best; t++) if (d[t] < lim && d[t] <= d[t - 1] && d[t] <= d[t + 1]) { tau = t; break; }
    }
  }
  if (tau < 1) return false;
  float a = d[tau - 1], b = d[tau], c = tau + 1 <= tauMax ? d[tau + 1] : d[tau];
  float den = a - 2 * b + c, sh = den != 0 ? (a - c) / (2 * den) : 0;
  hz = rate / (tau + sh); clarity = 1 - b;
  return true;
}

void Pitch::reset() { ring_.clear(); next_ = 0; floor_ = 0.004f; peak_ = 0.01f; hist_[0] = hist_[1] = hist_[2] = -1; hn_ = 0; }

std::vector<PitchReading> Pitch::feed(const float *s, int n, int rate, double now) {
  std::vector<PitchReading> out;
  ring_.insert(ring_.end(), s, s + n);
  const int N = rate >= 32000 ? 2048 : 1024;
  if ((int)ring_.size() > N * 4) ring_.erase(ring_.begin(), ring_.end() - N * 4);
  if (next_ == 0) next_ = now;
  while (now >= next_) {
    next_ += 0.04;
    if (next_ < now - 0.2) next_ = now;   // si nos hemos retrasado mucho, no recuperar
    if ((int)ring_.size() < N) continue;
    const float *b = ring_.data() + ring_.size() - N;
    double sum = 0;
    for (int i = 0; i < N; i++) sum += b[i] * b[i];
    float rms = (float)sqrt(sum / N);
    floor_ = rms < floor_ ? rms * 0.5f + floor_ * 0.5f : floor_ * 0.995f + rms * 0.005f;
    peak_ = std::max(rms, peak_ * 0.995f);
    level_ = std::min(1.f, rms / std::max(0.004f, peak_ * 0.8f));
    float midi = -1;
    if (rms > std::max(0.0007f, floor_ * 1.7f)) {
      float hz, cl;
      if (yin(b, N, rate, hz, cl) && cl > 0.55f) midi = 69 + 12 * log2f(hz / 440.f);
    }
    hist_[hn_++ % 3] = midi;
    float h[3] = {hist_[0], hist_[1], hist_[2]};
    int valid = (h[0] >= 0) + (h[1] >= 0) + (h[2] >= 0);
    float m = midi;
    if (valid == 3) { std::sort(h, h + 3); m = h[1]; }
    out.push_back({now, m, level_, m >= 0});
  }
  return out;
}
