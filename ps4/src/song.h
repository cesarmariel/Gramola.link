// Canciones UltraStar (.txt + audio + portada) en una carpeta de la consola.
#pragma once
#include <string>
#include <vector>

struct Note {
  char type;         // ':' normal, '*' dorada, 'F' libre, 'R' rap, 'G' rap dorada
  double start, end;  // segundos
  int pitch;         // tono UltraStar (0 = Do4; algunas canciones usan la numeración MIDI)
  std::string text;
  int weight;        // 2 dorada, 0 libre, 1 el resto
};

struct Line { std::vector<Note> notes; double start = 0, end = 0; };

struct Song {
  std::string dir, txt, title, artist, audio, cover, language, year;
  double gap = 0, bpm = 0, start = 0;   // START en segundos (para empezar más tarde)
  double preview = -1;                  // #PREVIEWSTART en segundos, si hay
  std::vector<Line> lines;              // solo tras load()
  int minp = 0, maxp = 12;
  double total_weight = 0;
  bool load();                          // lee las notas
};

std::vector<Song> scan_songs(const std::string &root);
std::string to_utf8(const std::string &raw);   // por si el .txt viene en Windows-1252
