#include "song.h"
#include <dirent.h>
#include <sys/stat.h>
#include <algorithm>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <map>

static bool valid_utf8(const std::string &s) {
  for (size_t i = 0; i < s.size();) {
    unsigned char c = s[i];
    int n = c < 0x80 ? 1 : (c >> 5) == 6 ? 2 : (c >> 4) == 14 ? 3 : (c >> 3) == 30 ? 4 : 0;
    if (!n || i + n > s.size()) return false;
    for (int k = 1; k < n; k++) if ((s[i + k] & 0xc0) != 0x80) return false;
    i += n;
  }
  return true;
}

std::string to_utf8(const std::string &raw) {
  std::string s = raw;
  if (s.size() >= 3 && (unsigned char)s[0] == 0xef && (unsigned char)s[1] == 0xbb && (unsigned char)s[2] == 0xbf) s = s.substr(3);
  if (valid_utf8(s)) return s;
  // Windows-1252 → UTF-8 (las comillas y guiones de 0x80-0x9f, el resto como Latin-1)
  static const uint16_t w[32] = {0x20ac, 0x81, 0x201a, 0x192, 0x201e, 0x2026, 0x2020, 0x2021, 0x2c6, 0x2030, 0x160, 0x2039, 0x152, 0x8d, 0x17d, 0x8f,
                                 0x90, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x2dc, 0x2122, 0x161, 0x203a, 0x153, 0x9d, 0x17e, 0x178};
  std::string o;
  for (unsigned char c : s) {
    uint32_t cp = c >= 0x80 && c < 0xa0 ? w[c - 0x80] : c;
    if (cp < 0x80) o += (char)cp;
    else if (cp < 0x800) { o += (char)(0xc0 | (cp >> 6)); o += (char)(0x80 | (cp & 63)); }
    else { o += (char)(0xe0 | (cp >> 12)); o += (char)(0x80 | ((cp >> 6) & 63)); o += (char)(0x80 | (cp & 63)); }
  }
  return o;
}

static std::string read_all(const std::string &p) {
  FILE *f = fopen(p.c_str(), "rb");
  if (!f) return "";
  std::string s;
  char b[16384]; size_t n;
  while ((n = fread(b, 1, sizeof b, f)) > 0) s.append(b, n);
  fclose(f);
  return to_utf8(s);
}

static double num(const std::string &s) { std::string t = s; std::replace(t.begin(), t.end(), ',', '.'); return atof(t.c_str()); }
static std::string trim(const std::string &s) {
  size_t a = s.find_first_not_of(" \t\r\n"), b = s.find_last_not_of(" \t\r\n");
  return a == std::string::npos ? "" : s.substr(a, b - a + 1);
}
static bool exists(const std::string &p) { struct stat st; return stat(p.c_str(), &st) == 0; }

// Cabeceras (y, con notas = true, también las notas de la voz 1)
static bool parse(Song &s, bool notas) {
  std::string text = read_all(s.dir + "/" + s.txt);
  if (text.empty()) return false;
  std::map<std::string, std::string> h;
  bool relative = false;
  int track = 0;
  double rel = 0;
  std::vector<std::vector<Note>> lines;
  bool newline = true;
  struct Raw { char t; int beat, len, pitch; std::string text; };
  std::vector<std::vector<Raw>> raw;
  size_t pos = 0;
  while (pos < text.size()) {
    size_t e = text.find('\n', pos);
    std::string l = text.substr(pos, e == std::string::npos ? std::string::npos : e - pos);
    pos = e == std::string::npos ? text.size() : e + 1;
    if (!l.empty() && l.back() == '\r') l.pop_back();
    if (trim(l).empty()) continue;
    if (l[0] == '#') {
      size_t i = l.find(':');
      if (i != std::string::npos) {
        std::string k = trim(l.substr(1, i - 1));
        for (auto &c : k) c = toupper(c);
        h[k] = trim(l.substr(i + 1));
        if (k == "RELATIVE") { std::string v = h[k]; for (auto &c : v) c = toupper(c); relative = v == "YES"; }
      }
      continue;
    }
    if (!notas) break;
    std::string tl = trim(l);
    if (tl == "E") break;
    if (l[0] == 'P' && l.size() > 1 && (isdigit((unsigned char)l[1]) || l[1] == ' ')) { track = atoi(tl.c_str() + 1) - 1; newline = true; rel = 0; continue; }
    if (track > 0) continue;   // dúos: de momento solo la voz 1
    if (l[0] == '-') {
      int a = 0, b = 0, k = sscanf(l.c_str() + 1, "%d %d", &a, &b);
      if (relative) rel += k > 1 ? b : a;
      newline = true;
      continue;
    }
    char t = l[0];
    if (!strchr(":*FRG", t)) continue;
    int beat, len, pitch, used = 0;
    if (sscanf(l.c_str() + 1, " %d %d %d%n", &beat, &len, &pitch, &used) < 3) continue;
    size_t tp = 1 + used;
    if (tp < l.size() && l[tp] == ' ') tp++;
    if (newline) { raw.emplace_back(); newline = false; }
    raw.back().push_back({t, beat + (int)(relative ? rel : 0), len, pitch, tp < l.size() ? l.substr(tp) : ""});
  }
  s.title = h.count("TITLE") ? h["TITLE"] : s.dir.substr(s.dir.rfind('/') + 1);
  s.artist = h["ARTIST"];
  s.language = h["LANGUAGE"];
  s.year = h["YEAR"];
  s.bpm = num(h["BPM"]);
  s.gap = num(h["GAP"]) / 1000.0;
  s.start = num(h["START"]);
  if (h.count("PREVIEWSTART")) s.preview = num(h["PREVIEWSTART"]);
  std::string a = h.count("AUDIO") ? h["AUDIO"] : h["MP3"];
  s.audio = a.empty() ? "" : s.dir + "/" + a;
  if (!h["COVER"].empty() && exists(s.dir + "/" + h["COVER"])) s.cover = s.dir + "/" + h["COVER"];
  if (s.bpm <= 0 || s.audio.empty() || !exists(s.audio)) return false;
  if (!notas) return true;
  const double beat = 60.0 / (s.bpm * 4);
  s.lines.clear();
  int mn = 1 << 30, mx = -(1 << 30);
  s.total_weight = 0;
  for (auto &rl : raw) {
    if (rl.empty()) continue;
    Line L;
    for (auto &r : rl) {
      Note n{r.t, s.gap + r.beat * beat, s.gap + (r.beat + r.len) * beat, r.pitch, r.text, r.t == '*' || r.t == 'G' ? 2 : r.t == 'F' ? 0 : 1};
      if (n.weight) { mn = std::min(mn, n.pitch); mx = std::max(mx, n.pitch); s.total_weight += (n.end - n.start) * n.weight; }
      L.notes.push_back(n);
    }
    L.start = L.notes.front().start; L.end = L.notes.back().end;
    s.lines.push_back(L);
  }
  s.minp = mn == (1 << 30) ? 0 : mn; s.maxp = mx == -(1 << 30) ? 12 : mx;
  return !s.lines.empty();
}

bool Song::load() { return parse(*this, true); }

std::vector<Song> scan_songs(const std::string &root) {
  std::vector<Song> out;
  DIR *d = opendir(root.c_str());
  if (!d) return out;
  while (dirent *e = readdir(d)) {
    if (e->d_name[0] == '.') continue;
    std::string dir = root + "/" + e->d_name;
    DIR *sd = opendir(dir.c_str());
    if (!sd) continue;
    std::string txt, img;
    while (dirent *f = readdir(sd)) {
      std::string n = f->d_name, lo = n;
      for (auto &c : lo) c = tolower(c);
      if (lo.size() > 4 && lo.substr(lo.size() - 4) == ".txt" && lo != "borrador.txt") txt = n;
      if (img.empty() && (lo.find("cover") != std::string::npos || lo.find("portada") != std::string::npos || lo.find("[co]") != std::string::npos) &&
          (lo.find(".jpg") != std::string::npos || lo.find(".png") != std::string::npos))
        img = n;
    }
    closedir(sd);
    if (txt.empty()) continue;
    Song s; s.dir = dir; s.txt = txt;
    if (!parse(s, false)) continue;
    if (s.cover.empty() && !img.empty()) s.cover = dir + "/" + img;
    out.push_back(s);
  }
  closedir(d);
  std::sort(out.begin(), out.end(), [](const Song &a, const Song &b) {
    auto lo = [](std::string s) { for (auto &c : s) c = tolower(c); return s; };
    return lo(a.artist + " " + a.title) < lo(b.artist + " " + b.title);
  });
  return out;
}
