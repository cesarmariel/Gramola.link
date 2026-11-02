// Mezclador: una música (MP3 decodificado entero en memoria, a 48 kHz estéreo) y efectos cortos.
#pragma once
#include <atomic>
#include <memory>
#include <string>
#include <vector>

namespace audio {

struct Pcm { std::vector<int16_t> s; size_t frames() const { return s.size() / 2; } };

void init();
std::shared_ptr<Pcm> decode(const std::string &path);   // MP3 → 48 kHz estéreo (lento: llamar en otro hilo)
void play(std::shared_ptr<Pcm> p, double from_s, float fade_in = 0, float volume = 1);
void fade_out(float seconds);
void stop();
void pause(bool p);
bool playing();
double position();        // segundos de la música que se oyen ahora (descontando el retraso de salida)
double length();
void set_volume(float v);
void sfx(std::shared_ptr<Pcm> p, float volume = 1);

}  // namespace audio
