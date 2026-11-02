// Dibujo 2D sobre la plataforma: imágenes, rectángulos de color y texto (Archivo) con caché.
#pragma once
#include <cstdint>
#include <string>
#include <vector>

namespace gfx {

struct Img { int id = 0, w = 0, h = 0; explicit operator bool() const { return id > 0; } };

// Colores del diseño (0xRRGGBB)
constexpr uint32_t INK = 0x201e1d, PAPER = 0xf2f2f2, WHITE = 0xffffff, RED = 0xec3013, GOLD = 0xe8a900,
                   GREY = 0x6b6767, LIGHT = 0xdddada, LINE = 0xe6e4e4;

enum Font { REGULAR, SEMIBOLD, BOLD, NFONTS };

bool init();
Img load(const std::string &path, int max_side = 0);   // png/jpg; 0 = tamaño original
Img from_rgba(int w, int h, const uint8_t *rgba, bool smooth = true);
void free(Img &i);

void image(const Img &i, float x, float y, float w, float h, float a = 1);
void image_cover(const Img &i, float x, float y, float w, float h, float a = 1);   // recorta para llenar
void rect(float x, float y, float w, float h, uint32_t rgb, float a = 1);
void frame(float x, float y, float w, float h, float t, uint32_t rgb, float a = 1);   // borde

// Texto: tamaño en píxeles. Devuelve el ancho dibujado.
float text(Font f, float px, const std::string &s, float x, float y, uint32_t rgb, float a = 1);
float text_w(Font f, float px, const std::string &s);
float text_c(Font f, float px, const std::string &s, float cx, float y, uint32_t rgb, float a = 1);   // centrado
float text_r(Font f, float px, const std::string &s, float rx, float y, uint32_t rgb, float a = 1);   // alineado a la derecha
std::string fit(Font f, float px, const std::string &s, float maxw);   // recorta con «…»
void end_frame();   // libera textos que no se usan

}  // namespace gfx
