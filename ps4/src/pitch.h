// Detección de tono con YIN (la misma que el micro del móvil: 25 lecturas por segundo, mediana de 3).
#pragma once
#include <vector>

struct PitchReading { double t; float midi; float vol; bool ok; };

class Pitch {
 public:
  void reset();
  // Mete las muestras nuevas del micro; devuelve las lecturas hechas (una cada 40 ms)
  std::vector<PitchReading> feed(const float *s, int n, int rate, double now);
  float level() const { return level_; }
 private:
  std::vector<float> ring_;
  double next_ = 0;
  float floor_ = 0.004f, peak_ = 0.01f, level_ = 0;
  float hist_[3] = {-1, -1, -1};
  int hn_ = 0;
};
