#pragma once

#include "../../unity.h"  // IWYU pragma: keep

// ---
// @class Json
// JSON parser and string utilities
//
// Function | Purpose
// --- | ---
// Json__bool(json, boolean) | parse and extract a boolean value
// Json__number(json, number) | parse and extract a f64 number
// Json__f32(json, number) | parse and extract an f32 number
// Json__u32(json, number) | parse and extract a u32 number
// Json__u16(json, number) | parse and extract a u16 number
// Json__string(json, str) | parse and extract a string
// Json__array_begin(json) | expect opening square bracket
// Json__array_item(json) | expect any valid token except closing bracket
// Json__array_end(json) | expect closing square bracket
// Json__object_begin(json) | expect opening curly brace
// Json__object_key(json, str) | expect key string followed by colon
// Json__object_key_is(json, len, expected) | match key against expected string
// Json__object_end(json) | expect closing curly brace
// Json__any(json) | parse next token (discard/ignore)
// Json__escape(src, dst) | escape string for JSON embedding
// Json__unescape(src, dst) | unescape JSON string

// Token / Symbol maps
#define JSON_DQUOTE ('"')
#define JSON_LF ('\n')

// sparse array; used to map ascii chars to tokens
static JsonTok _JSON_PUNCTS[256] = {
    // specifically 1-symbol tokens which have meaning by themselves
    ['{'] = JSON_OCURLY,
    ['}'] = JSON_CCURLY,
    ['['] = JSON_OBRACKET,
    [']'] = JSON_CBRACKET,
    [','] = JSON_COMMA,
    [':'] = JSON_COLON,
    // not incl. multi-symbol tokens, like the quotes around strings
};

// map cstr -> token (for reading strings)
static JsonSym _JSON__SYMBOLS_IN[] = {
    {.token = JSON_TRUE, .symbol = "true"},
    {.token = JSON_FALSE, .symbol = "false"},
    {.token = JSON_NULL, .symbol = "null"},
};

// map token -> cstr (for debug print of AST)
static JsonSym _JSON__SYMBOLS_OUT[] = {
    // NOTE: order matters; sync with JsonTok enum
    {.token = JSON_INVALID, .symbol = "(invalid)"},
    {.token = JSON_EOF, .symbol = "(end of input)"},
    {.token = JSON_OCURLY, .symbol = "{"},
    {.token = JSON_CCURLY, .symbol = "}"},
    {.token = JSON_OBRACKET, .symbol = "["},
    {.token = JSON_CBRACKET, .symbol = "]"},
    {.token = JSON_COMMA, .symbol = ","},
    {.token = JSON_COLON, .symbol = ":"},
    {.token = JSON_TRUE, .symbol = "true"},
    {.token = JSON_FALSE, .symbol = "false"},
    {.token = JSON_NULL, .symbol = "null"},
    {.token = JSON_STRING, .symbol = "(string)"},
    {.token = JSON_NUMBER, .symbol = "(number)"},
    {.token = JSON_BOOL, .symbol = "(boolean)"},
};

// reflection of enum token to string
static const char* _Json__token_reflect(JsonTok token) {
  if (token > JSON_COUNT) {
    token = JSON_INVALID;
  }
  return _JSON__SYMBOLS_OUT[token].symbol;
}

// Error Handling

static bool _Json_suppress_errors = false;

// print to stderr
static void _Json__errorf(Json* json, const char* fmt, ...) {
  if (_Json_suppress_errors) {
    return;
  }
  long line_number = 0;
  const char* line_start = json->data.str;
  const char* cur = json->data.str;
  while (cur < (json->data.str + json->token_start)) {
    char x = *cur++;
    if (JSON_LF == x) {
      line_start = cur;
      line_number++;
    }
  }

  fprintf(stderr, "%s:%ld:%ld: ", json->file_path, line_number + 1, cur - line_start + 1);
  va_list args;
  va_start(args, fmt);
  vfprintf(stderr, fmt, args);
  va_end(args);
  fprintf(stderr, "\n");
}

// report parse error
static void _Json__expected(Json* json, JsonTok token) {
  _Json__errorf(
      json,
      "JSON Parse Error: expected %s but got %s",
      _Json__token_reflect(token),
      _Json__token_reflect(json->token));
}

// assert document schema
static bool _Json__expect_token(Json* json, JsonTok token) {
  if (json->token != token) {
    _Json__expected(json, token);
    return false;
  }
  return true;
}

// Whitespace

// advance cursor to end while it points to whitespace
static void _Json__skip_whitespace(Json* json) {
  while (json->cur < json->data.len && isspace(*(json->data.str + json->cur))) {
    json->cur++;
  }
}

// General Purpose

// advance exactly one token, until eof (primary walk fn)
static bool _Json__next_token(Json* json) {
  _Json__skip_whitespace(json);

  json->token_start = json->cur;

  if (json->cur >= json->data.len) {
    json->token = JSON_EOF;
    return false;
  }

  // check for 1-symbol token (ie. punctuation)
  json->token = _JSON_PUNCTS[(u8) * (json->data.str + json->cur)];
  if (0 != json->token) {
    json->cur++;
    return true;
  }

  // check for valid literal (ie. bool, null)
  static u8 len = ARRAYSIZE(_JSON__SYMBOLS_IN);
  for (u32 i = 0; i < len; i++) {
    const char* symbol = _JSON__SYMBOLS_IN[i].symbol;
    if (*symbol == *(json->data.str + json->cur)) {  // char comparison
      // string comparison
      while (0 != *symbol &&  // not end of symbol str
             json->cur < json->data.len &&  // not end of document
             *symbol++ == *(json->data.str + json->cur++)  // chars in both str match
      );  // continue while matching
      if (0 != *symbol) {  // some part of string unmatched
        json->token = JSON_INVALID;
        _Json__errorf(json, "JSON Parse Error: invalid symbol");
        return false;
      } else {  // all chars in both strings are a match
        json->token = _JSON__SYMBOLS_IN[i].token;
        return true;
      }
    }
  }

  // check for valid number (ie. int, float)
  char* endptr = NULL;
  // NOTE: this assumes the cstr is null-terminated
  json->token_value.number = strtod((json->data.str + json->cur), &endptr);
  if ((json->data.str + json->cur) != endptr) {
    json->cur = endptr - json->data.str;
    json->token = JSON_NUMBER;
    return true;
  }

  // check for valid string
  if (JSON_DQUOTE == *(json->data.str + json->cur)) {
    json->cur++;
    json->token_value.str.str = (char*)(json->data.str + json->cur);
    json->token_value.str.len = 0;
    json->token_value.str.life = json->data.life;
    // NOTE: alternatively, mutable could always be false here
    json->token_value.str.mut = json->data.mut;
    json->token_value.str.slice = true;
    while (json->cur < json->data.len) {
      char c = *(json->data.str + json->cur);
      if (c == '\\' && json->cur + 1 < json->data.len) {
        // Skip escaped character (e.g., \", \\, \n, etc.)
        json->cur += 2;
        json->token_value.str.len += 2;
      } else if (c == JSON_DQUOTE) {
        json->cur++;
        json->token = JSON_STRING;
        return true;
      } else {
        json->cur++;
        json->token_value.str.len++;
      }
    }

    json->token = JSON_INVALID;
    _Json__errorf(json, "JSON Parse Error: unfinished string");
    return false;
  }

  // report unrecognized token
  json->token = JSON_INVALID;
  _Json__errorf(json, "JSON Parse Error: invalid token");
  return false;
}

// convenient 2-step wrapper for common pattern
static bool _Json__expect_next_token(Json* json, JsonTok token) {
  if (!_Json__next_token(json)) {
    return false;
  }
  return _Json__expect_token(json, token);
}

// Booleans

bool Json__bool(Json* json, bool* boolean) {
  _Json__next_token(json);
  if (json->token == JSON_TRUE) {
    *boolean = true;  // copy
  } else if (json->token == JSON_FALSE) {
    *boolean = false;  // copy
  } else {
    _Json__expected(json, JSON_BOOL);
    return false;
  }
  return true;
}

// Numbers

bool Json__number(Json* json, f64* number) {
  if (!_Json__expect_next_token(json, JSON_NUMBER)) {
    return false;
  }
  *number = json->token_value.number;  // copy
  return true;
}

bool Json__f32(Json* json, f32* number) {
  if (!_Json__expect_next_token(json, JSON_NUMBER)) {
    return false;
  }
  *number = (f32)json->token_value.number;  // copy
  return true;
}

bool Json__u32(Json* json, u32* number) {
  if (!_Json__expect_next_token(json, JSON_NUMBER)) {
    return false;
  }
  *number = (u32)json->token_value.number;  // copy
  return true;
}

bool Json__u16(Json* json, u16* number) {
  if (!_Json__expect_next_token(json, JSON_NUMBER)) {
    return false;
  }
  *number = (u16)json->token_value.number;  // copy
  return true;
}

// Strings

bool Json__string(Json* json, Str8* str) {
  if (!_Json__expect_next_token(json, JSON_STRING)) {
    return false;
  }
  *str = json->token_value.str;  // ref
  return true;
}

// Arrays

// expect opening square bracket
bool Json__array_begin(Json* json) {
  return _Json__expect_next_token(json, JSON_OBRACKET);
}

// expect any valid token (ignoring comma) except closing square bracket
bool Json__array_item(Json* json) {
  u32 cur = json->cur;
  if (!_Json__next_token(json)) {
    return false;
  }
  if (json->token == JSON_COMMA) {
    return true;
  }
  if (json->token == JSON_CBRACKET) {
    json->cur = cur;
    return false;
  }
  json->cur = cur;
  return true;
}

// expect closing square bracket
bool Json__array_end(Json* json) {
  return _Json__expect_next_token(json, JSON_CBRACKET);
}

// Objects

// expect opening curly brace
bool Json__object_begin(Json* json) {
  return _Json__expect_next_token(json, JSON_OCURLY);
}

// expect a key string (optionally preceded by comma) followed by a colon.
// early-exit on closing curly brace.
bool Json__object_key(Json* json, Str8* str) {
  u32 cur = json->cur;
  if (!_Json__next_token(json)) {
    return false;
  }
  // continuation of object (key)
  if (json->token == JSON_COMMA) {
    if (!Json__string(json, str)) {
      return false;
    }
    if (!_Json__expect_next_token(json, JSON_COLON)) {
      return false;
    }
    return true;
  }
  // end of object
  if (json->token == JSON_CCURLY) {
    json->cur = cur;
    return false;
  }
  // beginning of object (key)
  if (!_Json__expect_token(json, JSON_STRING)) {
    return false;
  }
  *str = json->token_value.str;
  if (!_Json__expect_next_token(json, JSON_COLON)) {
    return false;
  }
  return true;
}

bool Json__object_key_is(Json* json, u32 len, const char* expected) {
  Str8 key = {0};
  return  //
      Json__object_key(json, &key) &&  //
      cstr__eq(len, expected, key.str);  //
}

// expect closing curly brace
bool Json__object_end(Json* json) {
  return _Json__expect_next_token(json, JSON_CCURLY);
}

// Wildcard

// typically used to discard/ignore/not-enforce next token
bool Json__any(Json* json) {
  return _Json__next_token(json);
}

// String Utilities

// Escape a string for JSON embedding (handles quotes, newlines, backslashes, etc)
// dst->str must point to buffer, dst->len must be set to buffer capacity
// On return, dst->len is updated to actual written length (excluding null terminator)
void Json__escape(Str8 src, Str8* dst) {
  u32 capacity = dst->len;
  u32 di = 0;
  for (u32 si = 0; si < src.len && di < capacity - 2; si++) {
    char c = src.str[si];
    if (c == '"' || c == '\\') {
      dst->str[di++] = '\\';
      dst->str[di++] = c;
    } else if (c == '\n') {
      dst->str[di++] = '\\';
      dst->str[di++] = 'n';
    } else if (c == '\r') {
      dst->str[di++] = '\\';
      dst->str[di++] = 'r';
    } else if (c == '\t') {
      dst->str[di++] = '\\';
      dst->str[di++] = 't';
    } else {
      dst->str[di++] = c;
    }
  }
  dst->str[di] = '\0';
  dst->len = (u16)di;
}

// Unescape a JSON string (handles \n, \r, \t, \", \\)
// dst->str must point to buffer, dst->len must be set to buffer capacity
// On return, dst->len is updated to actual written length (excluding null terminator)
void Json__unescape(Str8 src, Str8* dst) {
  u32 capacity = dst->len;
  u32 di = 0;
  for (u32 si = 0; si < src.len && di < capacity - 1; si++) {
    if (src.str[si] == '\\' && si + 1 < src.len) {
      char next = src.str[si + 1];
      if (next == '"') {
        dst->str[di++] = '"';
        si++;
      } else if (next == '\\') {
        dst->str[di++] = '\\';
        si++;
      } else if (next == 'n') {
        dst->str[di++] = '\n';
        si++;
      } else if (next == 'r') {
        dst->str[di++] = '\r';
        si++;
      } else if (next == 't') {
        dst->str[di++] = '\t';
        si++;
      } else {
        dst->str[di++] = src.str[si];
      }
    } else {
      dst->str[di++] = src.str[si];
    }
  }
  dst->str[di] = '\0';
  dst->len = (u16)di;
}