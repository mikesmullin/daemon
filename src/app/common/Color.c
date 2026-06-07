#pragma once

#include "../../unity.h"

// ---
// @class Color
// ANSI terminal color escape code helpers
//
// Macro | Purpose
// --- | ---
// COLOR__TO_ANSI(r, g, b) | generate ANSI 24-bit foreground color escape code
// COLOR__TO_ANSI_BG(r, g, b) | generate ANSI 24-bit background color escape code
//
// COLOR__RESET | reset terminal color to default
// COLOR__BLUE | light blue foreground
// COLOR__PINK | hot pink foreground
// COLOR__YELLOW | construction yellow foreground
// COLOR__GREEN | money green foreground
// COLOR__PURPLE | indigo foreground
// COLOR__GREY | charcoal foreground
// COLOR__CYAN | cyan foreground
// COLOR__RED | error red foreground

// ANSI Color helpers

#define COLOR__TO_ANSI(r, g, b) "\x1b[38;2;" #r ";" #g ";" #b "m"
#define COLOR__TO_ANSI_BG(r, g, b) "\x1b[48;2;" #r ";" #g ";" #b "m"
#define COLOR__RESET "\x1b[0m"
#define COLOR__BLUE COLOR__TO_ANSI(52, 214, 247)  // light blue
#define COLOR__PINK COLOR__TO_ANSI(255, 82, 187)  // hot pink
#define COLOR__YELLOW COLOR__TO_ANSI(206, 173, 73)  // construction yellow
#define COLOR__GREEN COLOR__TO_ANSI(37, 168, 103)  // money green
#define COLOR__PURPLE COLOR__TO_ANSI(128, 114, 174)  // indigo
#define COLOR__GREY COLOR__TO_ANSI(33, 33, 33)  // charcoal
#define COLOR__CYAN COLOR__TO_ANSI(0, 255, 255)  // cyan
#define COLOR__RED COLOR__TO_ANSI(255, 82, 82)  // error red

// u8 Color__toAnsi(Pixel* c, bool isBg, char* out) {
//   return sprintf(out, "\x1b[%u;2;%u;%u;%um", isBg ? 48 : 38, c->r, c->g, c->b);
// }
