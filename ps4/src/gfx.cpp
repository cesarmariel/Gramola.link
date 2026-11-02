#include "gfx.h"
#include "plat.h"
#include <cmath>
#include <cstdio>
#include <cstring>
#include <map>
#include <unordered_map>

#define STB_IMAGE_IMPLEMENTATION
#define STBI_ONLY_PNG
#define STBI_ONLY_JPEG
#include "../third_party/stb_image.h"
#define STB_TRUETYPE_IMPLEMENTATION
#include "../third_party/stb_truetype.h"

namespace gfx {

static std::vector<uint8_t> font_data[NFONTS];
static stbtt_fontinfo fonts[NFONTS];
static Img white;
static long frame_no = 0;

static std::vector<uint8_t> read_file(const std::string &p) {
  std::vector<uint8_t> d;
  FILE *f = fopen(p.c_str(), "rb");
  if (!f) return d;
  fseek(f, 0, SEEK_END); long n = ftell(f); fseek(f, 0, SEEK_SET);
  d.resize(n > 0 ? n : 0);
  if (n > 0 && fread(d.data(), 1, n, f) != (size_t)n) d.clear();
  fclose(f);
  return d;
}

bool init() {
  const char *names[NFONTS] = {"fonts/Archivo-Regular.ttf", "fonts/Archivo-SemiBold.ttf", "fonts/Archivo-ExtraBold.ttf"};
  for (int i = 0; i < NFONTS; i++) {
    font_data[i] = read_file(plat::assets() + names[i]);
    if (font_data[i].empty() || !stbtt_InitFont(&fonts[i], font_data[i].data(), 0)) { plat::log("sin fuente %s", names[i]); return false; }
  }
  uint8_t w[4 * 4 * 4]; memset(w, 255, sizeof w);
  white = from_rgba(4, 4, w, false);
  return true;
}

Img from_rgba(int w, int h, const uint8_t *rgba, bool smooth) {
  Img i; i.id = plat::tex_create(w, h, rgba, smooth); i.w = w; i.h = h; return i;
}

Img load(const std::string &path, int max_side) {
  int w, h, n;
  auto d = read_file(path);
  if (d.empty()) return {};
  uint8_t *px = stbi_load_from_memory(d.data(), (int)d.size(), &w, &h, &n, 4);
  if (!px) return {};
  Img out;
  if (max_side && (w > max_side || h > max_side)) {
    // reducción por promedio de cajas (las portadas vienen a 600-1000 px; en pantalla van a ~300)
    float k = std::max(w, h) / (float)max_side;
    int nw = std::max(1, (int)(w / k)), nh = std::max(1, (int)(h / k));
    std::vector<uint8_t> s(nw * nh * 4);
    for (int y = 0; y < nh; y++)
      for (int x = 0; x < nw; x++) {
        int x0 = (int)(x * k), x1 = std::max(x0 + 1, (int)((x + 1) * k)), y0 = (int)(y * k), y1 = std::max(y0 + 1, (int)((y + 1) * k));
        unsigned acc[4] = {0, 0, 0, 0}, c = 0;
        for (int yy = y0; yy < y1 && yy < h; yy++)
          for (int xx = x0; xx < x1 && xx < w; xx++) { const uint8_t *p = px + (yy * w + xx) * 4; for (int j = 0; j < 4; j++) acc[j] += p[j]; c++; }
        for (int j = 0; j < 4; j++) s[(y * nw + x) * 4 + j] = c ? acc[j] / c : 0;
      }
    out = from_rgba(nw, nh, s.data());
  } else out = from_rgba(w, h, px);
  stbi_image_free(px);
  return out;
}

void free(Img &i) { if (i.id) plat::tex_free(i.id); i = Img{}; }

void image(const Img &i, float x, float y, float w, float h, float a) {
  if (i) plat::draw(i.id, i.w, i.h, 0, 0, i.w, i.h, x, y, w, h, a);
}

void image_cover(const Img &i, float x, float y, float w, float h, float a) {
  if (!i) return;
  float k = std::max(w / i.w, h / i.h), sw = w / k, sh = h / k;
  plat::draw(i.id, i.w, i.h, (i.w - sw) / 2, (i.h - sh) / 2, sw, sh, x, y, w, h, a);
}

// Un rectángulo de color = textura blanca de 1 color teñida… pero el shader de la PS4 no tiñe:
// se guarda una textura pequeña por color.
static std::unordered_map<uint32_t, Img> solids;
void rect(float x, float y, float w, float h, uint32_t rgb, float a) {
  if (w <= 0 || h <= 0) return;
  auto it = solids.find(rgb);
  if (it == solids.end()) {
    uint8_t px[4 * 4 * 4];
    for (int i = 0; i < 16; i++) { px[i * 4] = rgb >> 16; px[i * 4 + 1] = (rgb >> 8) & 255; px[i * 4 + 2] = rgb & 255; px[i * 4 + 3] = 255; }
    it = solids.emplace(rgb, from_rgba(4, 4, px, false)).first;
  }
  plat::draw(it->second.id, 4, 4, 1, 1, 2, 2, x, y, w, h, a);
}

void frame(float x, float y, float w, float h, float t, uint32_t rgb, float a) {
  rect(x, y, w, t, rgb, a); rect(x, y + h - t, w, t, rgb, a);
  rect(x, y + t, t, h - 2 * t, rgb, a); rect(x + w - t, y + t, t, h - 2 * t, rgb, a);
}

// ---------------- texto
static std::vector<uint32_t> utf8(const std::string &s) {
  std::vector<uint32_t> o;
  for (size_t i = 0; i < s.size();) {
    unsigned char c = s[i];
    uint32_t cp; int n;
    if (c < 0x80) { cp = c; n = 1; } else if ((c >> 5) == 6) { cp = c & 31; n = 2; } else if ((c >> 4) == 14) { cp = c & 15; n = 3; } else { cp = c & 7; n = 4; }
    for (int k = 1; k < n && i + k < s.size(); k++) cp = (cp << 6) | (s[i + k] & 63);
    o.push_back(cp); i += n;
  }
  return o;
}

static float measure(Font f, float px, const std::vector<uint32_t> &cps) {
  const stbtt_fontinfo &fi = fonts[f];
  float sc = stbtt_ScaleForMappingEmToPixels(&fi, px), w = 0;
  for (size_t i = 0; i < cps.size(); i++) {
    int adv, lsb; stbtt_GetCodepointHMetrics(&fi, cps[i], &adv, &lsb);
    w += adv * sc;
    if (i + 1 < cps.size()) w += stbtt_GetCodepointKernAdvance(&fi, cps[i], cps[i + 1]) * sc;
  }
  return w;
}

struct TextTex { Img img; float w; float oy; long used; };
static std::unordered_map<std::string, TextTex> cache;

static TextTex *get(Font f, float px, const std::string &s, uint32_t rgb) {
  char k[48]; snprintf(k, sizeof k, "%d|%.1f|%06x|", (int)f, px, rgb);
  std::string key = k + s;
  auto it = cache.find(key);
  if (it != cache.end()) { it->second.used = frame_no; return &it->second; }
  const stbtt_fontinfo &fi = fonts[f];
  auto cps = utf8(s);
  float sc = stbtt_ScaleForMappingEmToPixels(&fi, px);
  int asc, desc, gap; stbtt_GetFontVMetrics(&fi, &asc, &desc, &gap);
  float w = measure(f, px, cps);
  int bw = (int)ceilf(w) + 4, bh = (int)ceilf((asc - desc) * sc) + 4;
  std::vector<uint8_t> alpha(bw * bh, 0);
  float x = 2, base = 2 + asc * sc;
  for (size_t i = 0; i < cps.size(); i++) {
    int adv, lsb; stbtt_GetCodepointHMetrics(&fi, cps[i], &adv, &lsb);
    int x0, y0, x1, y1;
    float fx = x - floorf(x);
    stbtt_GetCodepointBitmapBoxSubpixel(&fi, cps[i], sc, sc, fx, 0, &x0, &y0, &x1, &y1);
    int gw = x1 - x0, gh = y1 - y0;
    if (gw > 0 && gh > 0) {
      std::vector<uint8_t> g(gw * gh);
      stbtt_MakeCodepointBitmapSubpixel(&fi, g.data(), gw, gh, gw, sc, sc, fx, 0, cps[i]);
      int ox = (int)floorf(x) + x0, oy = (int)roundf(base) + y0;
      for (int yy = 0; yy < gh; yy++)
        for (int xx = 0; xx < gw; xx++) {
          int X = ox + xx, Y = oy + yy;
          if (X < 0 || Y < 0 || X >= bw || Y >= bh) continue;
          uint8_t &d = alpha[Y * bw + X]; d = std::max(d, g[yy * gw + xx]);
        }
    }
    x += adv * sc;
    if (i + 1 < cps.size()) x += stbtt_GetCodepointKernAdvance(&fi, cps[i], cps[i + 1]) * sc;
  }
  std::vector<uint8_t> rgba(bw * bh * 4);
  for (int i = 0; i < bw * bh; i++) { rgba[i * 4] = rgb >> 16; rgba[i * 4 + 1] = (rgb >> 8) & 255; rgba[i * 4 + 2] = rgb & 255; rgba[i * 4 + 3] = alpha[i]; }
  TextTex t{from_rgba(bw, bh, rgba.data()), w, -2.f, frame_no};
  return &cache.emplace(key, t).first->second;
}

float text_w(Font f, float px, const std::string &s) { return measure(f, px, utf8(s)); }

float text(Font f, float px, const std::string &s, float x, float y, uint32_t rgb, float a) {
  if (s.empty()) return 0;
  TextTex *t = get(f, px, s, rgb);
  image(t->img, x - 2, y + t->oy, t->img.w, t->img.h, a);
  return t->w;
}

float text_c(Font f, float px, const std::string &s, float cx, float y, uint32_t rgb, float a) {
  return text(f, px, s, cx - text_w(f, px, s) / 2, y, rgb, a);
}

float text_r(Font f, float px, const std::string &s, float rx, float y, uint32_t rgb, float a) {
  return text(f, px, s, rx - text_w(f, px, s), y, rgb, a);
}

std::string fit(Font f, float px, const std::string &s, float maxw) {
  if (text_w(f, px, s) <= maxw) return s;
  auto cps = utf8(s);
  std::string out;
  while (!cps.empty()) {
    cps.pop_back();
    std::string t;
    for (uint32_t c : cps) {
      if (c < 0x80) t += (char)c;
      else if (c < 0x800) { t += (char)(0xc0 | (c >> 6)); t += (char)(0x80 | (c & 63)); }
      else if (c < 0x10000) { t += (char)(0xe0 | (c >> 12)); t += (char)(0x80 | ((c >> 6) & 63)); t += (char)(0x80 | (c & 63)); }
      else { t += (char)(0xf0 | (c >> 18)); t += (char)(0x80 | ((c >> 12) & 63)); t += (char)(0x80 | ((c >> 6) & 63)); t += (char)(0x80 | (c & 63)); }
    }
    while (!t.empty() && t.back() == ' ') t.pop_back();
    if (text_w(f, px, t + "…") <= maxw) return t + "…";
  }
  return "…";
}

void end_frame() {
  frame_no++;
  if (frame_no % 120) return;
  for (auto it = cache.begin(); it != cache.end();) {
    if (frame_no - it->second.used > 300) { free(it->second.img); it = cache.erase(it); } else ++it;
  }
}

}  // namespace gfx
