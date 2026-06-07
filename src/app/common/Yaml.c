#pragma once

#include "../../unity.h"  // IWYU pragma: keep

// ---
// @class Yaml
// minimal YAML parser
//
// Function | Purpose
// --- | ---
// Yaml__init(yaml, data, len, file_path) | initialize parser state
// Yaml__next(yaml) | get next token
// Yaml__string(yaml, str) | read string value
// Yaml__number(yaml, number) | read number value
// Yaml__bool(yaml, value) | read boolean value
//
// Yaml__is_key(yaml) | check if current token is a key (string followed by colon)
// Yaml__key(yaml, key) | read a key (string before colon)
// Yaml__key_is(yaml, expected) | check if at a specific key
// Yaml__key_string(yaml, key, out, out_sz) | read a string value after key
//
// Yaml__skip_value(yaml) | skip current value (for unknown keys)
// Yaml__is_list_item(yaml) | check if at list item (-)
// Yaml__list_item(yaml) | consume list item marker
//
// Yaml__flowToJson(flow, json, json_sz) | convert YAML flow syntax to JSON

// Token / Symbol maps
#define YAML_LF ('\n')
#define YAML_CR ('\r')
#define YAML_SPACE (' ')
#define YAML_TAB ('\t')
#define YAML_DQUOTE ('"')
#define YAML_SQUOTE ('\'')
#define YAML_HASH ('#')

// Map cstr -> token (for reading keywords)
static YamlSym _YAML__SYMBOLS_IN[] = {
    {.token = YAML_TRUE, .symbol = "true"},   {.token = YAML_TRUE, .symbol = "True"},
    {.token = YAML_TRUE, .symbol = "TRUE"},   {.token = YAML_TRUE, .symbol = "yes"},
    {.token = YAML_TRUE, .symbol = "Yes"},    {.token = YAML_TRUE, .symbol = "YES"},
    {.token = YAML_TRUE, .symbol = "on"},     {.token = YAML_TRUE, .symbol = "On"},
    {.token = YAML_TRUE, .symbol = "ON"},     {.token = YAML_FALSE, .symbol = "false"},
    {.token = YAML_FALSE, .symbol = "False"}, {.token = YAML_FALSE, .symbol = "FALSE"},
    {.token = YAML_FALSE, .symbol = "no"},    {.token = YAML_FALSE, .symbol = "No"},
    {.token = YAML_FALSE, .symbol = "NO"},    {.token = YAML_FALSE, .symbol = "off"},
    {.token = YAML_FALSE, .symbol = "Off"},   {.token = YAML_FALSE, .symbol = "OFF"},
    {.token = YAML_NULL, .symbol = "null"},   {.token = YAML_NULL, .symbol = "Null"},
    {.token = YAML_NULL, .symbol = "NULL"},   {.token = YAML_NULL, .symbol = "~"},
};

// Map token -> cstr (for debug)
static YamlSym _YAML__SYMBOLS_OUT[] = {
    {.token = YAML_INVALID, .symbol = "(invalid)"},
    {.token = YAML_EOF, .symbol = "(eof)"},
    {.token = YAML_COLON, .symbol = ":"},
    {.token = YAML_DASH, .symbol = "-"},
    {.token = YAML_PIPE, .symbol = "|"},
    {.token = YAML_GT, .symbol = ">"},
    {.token = YAML_NEWLINE, .symbol = "(newline)"},
    {.token = YAML_INDENT, .symbol = "(indent)"},
    {.token = YAML_TRUE, .symbol = "true"},
    {.token = YAML_FALSE, .symbol = "false"},
    {.token = YAML_NULL, .symbol = "null"},
    {.token = YAML_STRING, .symbol = "(string)"},
    {.token = YAML_NUMBER, .symbol = "(number)"},
    {.token = YAML_KEY, .symbol = "(key)"},
};

static bool _Yaml_suppress_errors = false;

// Reflection of enum token to string
static const char* _Yaml__token_reflect(YamlTok token) {
  if (token >= YAML_COUNT) {
    token = YAML_INVALID;
  }
  return _YAML__SYMBOLS_OUT[token].symbol;
}

// Error handling
static void _Yaml__errorf(Yaml* yaml, const char* fmt, ...) {
  if (_Yaml_suppress_errors)
    return;
  fprintf(stderr, "%s:%u:%u: ", yaml->file_path, yaml->line + 1, yaml->col + 1);
  va_list args;
  va_start(args, fmt);
  vfprintf(stderr, fmt, args);
  va_end(args);
  fprintf(stderr, "\n");
}

static void _Yaml__expected(Yaml* yaml, YamlTok token) {
  _Yaml__errorf(
      yaml,
      "YAML Parse Error: expected %s but got %s",
      _Yaml__token_reflect(token),
      _Yaml__token_reflect(yaml->token));
}

static bool _Yaml__expect_token(Yaml* yaml, YamlTok token) {
  if (yaml->token != token) {
    _Yaml__expected(yaml, token);
    return false;
  }
  return true;
}

// Character helpers
static bool _Yaml__is_whitespace(char c) {
  return c == YAML_SPACE || c == YAML_TAB;
}

static bool _Yaml__is_newline(char c) {
  return c == YAML_LF || c == YAML_CR;
}

// Count leading spaces (for indentation)
static u16 _Yaml__count_indent(Yaml* yaml) {
  u16 count = 0;
  u32 pos = yaml->cur;
  while (pos < yaml->data.len && yaml->data.str[pos] == YAML_SPACE) {
    count++;
    pos++;
  }
  return count;
}

// Skip to end of line (for comments)
static void _Yaml__skip_to_eol(Yaml* yaml) {
  while (yaml->cur < yaml->data.len && !_Yaml__is_newline(yaml->data.str[yaml->cur])) {
    yaml->cur++;
    yaml->col++;
  }
}

// Skip inline whitespace (not newlines)
static void _Yaml__skip_inline_whitespace(Yaml* yaml) {
  while (yaml->cur < yaml->data.len && _Yaml__is_whitespace(yaml->data.str[yaml->cur])) {
    yaml->cur++;
    yaml->col++;
  }
}

// Read a quoted string
static bool _Yaml__read_quoted_string(Yaml* yaml, char quote) {
  yaml->cur++;  // skip opening quote
  yaml->col++;
  yaml->token_value.str.str = (char*)(yaml->data.str + yaml->cur);
  yaml->token_value.str.len = 0;
  yaml->token_value.str.slice = true;
  yaml->token_value.str.mut = false;

  while (yaml->cur < yaml->data.len) {
    char c = yaml->data.str[yaml->cur];
    if (c == quote) {
      yaml->cur++;  // skip closing quote
      yaml->col++;
      yaml->token = YAML_STRING;
      return true;
    }
    // TODO: handle escape sequences
    yaml->cur++;
    yaml->col++;
    yaml->token_value.str.len++;
  }

  yaml->token = YAML_INVALID;
  _Yaml__errorf(yaml, "YAML Parse Error: unterminated string");
  return false;
}

// Read an unquoted string (until : or newline or #)
static bool _Yaml__read_unquoted_string(Yaml* yaml) {
  yaml->token_value.str.str = (char*)(yaml->data.str + yaml->cur);
  yaml->token_value.str.len = 0;
  yaml->token_value.str.slice = true;
  yaml->token_value.str.mut = false;

  while (yaml->cur < yaml->data.len) {
    char c = yaml->data.str[yaml->cur];
    if (_Yaml__is_newline(c) || c == YAML_HASH) {
      break;
    }
    // Check for colon followed by space (key delimiter)
    if (c == ':' && yaml->cur + 1 < yaml->data.len) {
      char next = yaml->data.str[yaml->cur + 1];
      if (_Yaml__is_whitespace(next) || _Yaml__is_newline(next)) {
        break;
      }
    }
    yaml->cur++;
    yaml->col++;
    yaml->token_value.str.len++;
  }

  // Trim trailing whitespace
  while (yaml->token_value.str.len > 0 &&
         _Yaml__is_whitespace(yaml->token_value.str.str[yaml->token_value.str.len - 1])) {
    yaml->token_value.str.len--;
  }

  yaml->token = YAML_STRING;
  return yaml->token_value.str.len > 0;
}

// Read a block scalar (| or >)
static bool _Yaml__read_block_scalar(Yaml* yaml, bool literal) {
  yaml->cur++;  // skip | or >
  yaml->col++;

  // Skip to end of line
  _Yaml__skip_inline_whitespace(yaml);
  if (yaml->cur < yaml->data.len && yaml->data.str[yaml->cur] == YAML_HASH) {
    _Yaml__skip_to_eol(yaml);
  }

  // Skip newline
  if (yaml->cur < yaml->data.len && yaml->data.str[yaml->cur] == YAML_CR)
    yaml->cur++;
  if (yaml->cur < yaml->data.len && yaml->data.str[yaml->cur] == YAML_LF) {
    yaml->cur++;
    yaml->line++;
    yaml->col = 0;
  }

  // Determine block indentation from first content line
  u16 block_indent = _Yaml__count_indent(yaml);
  if (block_indent == 0) {
    yaml->token = YAML_STRING;
    yaml->token_value.str.str = "";
    yaml->token_value.str.len = 0;
    return true;
  }

  yaml->token_value.str.str = (char*)(yaml->data.str + yaml->cur);
  yaml->token_value.str.len = 0;

  // Collect lines with at least block_indent indentation
  u32 start = yaml->cur;
  while (yaml->cur < yaml->data.len) {
    u16 line_indent = _Yaml__count_indent(yaml);

    // Empty line or line with less indentation ends block
    if (line_indent < block_indent && !_Yaml__is_newline(yaml->data.str[yaml->cur + line_indent])) {
      break;
    }

    // Skip past indentation
    yaml->cur += line_indent;
    yaml->col = line_indent;

    // Read line content
    while (yaml->cur < yaml->data.len && !_Yaml__is_newline(yaml->data.str[yaml->cur])) {
      yaml->cur++;
      yaml->col++;
    }

    // Include newline
    if (yaml->cur < yaml->data.len) {
      if (yaml->data.str[yaml->cur] == YAML_CR)
        yaml->cur++;
      if (yaml->cur < yaml->data.len && yaml->data.str[yaml->cur] == YAML_LF) {
        yaml->cur++;
        yaml->line++;
        yaml->col = 0;
      }
    }
  }

  yaml->token_value.str.len = yaml->cur - start;
  yaml->token = YAML_STRING;
  return true;
}

// Advance to next token
static bool _Yaml__next_token(Yaml* yaml) {
  yaml->token_start = yaml->cur;

  // EOF check
  if (yaml->cur >= yaml->data.len) {
    yaml->token = YAML_EOF;
    return false;
  }

  char c = yaml->data.str[yaml->cur];

  // Handle newlines
  if (_Yaml__is_newline(c)) {
    if (c == YAML_CR)
      yaml->cur++;
    if (yaml->cur < yaml->data.len && yaml->data.str[yaml->cur] == YAML_LF)
      yaml->cur++;
    yaml->line++;
    yaml->col = 0;
    yaml->indent = _Yaml__count_indent(yaml);
    yaml->cur += yaml->indent;
    yaml->col = yaml->indent;
    yaml->token = YAML_NEWLINE;
    return true;
  }

  // Skip inline whitespace
  _Yaml__skip_inline_whitespace(yaml);
  if (yaml->cur >= yaml->data.len) {
    yaml->token = YAML_EOF;
    return false;
  }

  c = yaml->data.str[yaml->cur];

  // Skip comments
  if (c == YAML_HASH) {
    _Yaml__skip_to_eol(yaml);
    return _Yaml__next_token(yaml);
  }

  // Skip document markers (---, ...)
  if (c == '-' && yaml->cur + 2 < yaml->data.len && yaml->data.str[yaml->cur + 1] == '-' &&
      yaml->data.str[yaml->cur + 2] == '-') {
    yaml->cur += 3;
    yaml->col += 3;
    _Yaml__skip_to_eol(yaml);
    return _Yaml__next_token(yaml);
  }

  // Single-char tokens
  if (c == ':') {
    yaml->cur++;
    yaml->col++;
    yaml->token = YAML_COLON;
    return true;
  }

  if (c == '-') {
    // Check if list item (dash followed by space)
    if (yaml->cur + 1 < yaml->data.len && _Yaml__is_whitespace(yaml->data.str[yaml->cur + 1])) {
      yaml->cur++;
      yaml->col++;
      yaml->token = YAML_DASH;
      return true;
    }
    // Otherwise part of a value
  }

  if (c == '|') {
    return _Yaml__read_block_scalar(yaml, true);
  }

  if (c == '>') {
    return _Yaml__read_block_scalar(yaml, false);
  }

  // Quoted strings
  if (c == YAML_DQUOTE || c == YAML_SQUOTE) {
    return _Yaml__read_quoted_string(yaml, c);
  }

  // Check for boolean/null literals
  for (u32 i = 0; i < ARRAYSIZE(_YAML__SYMBOLS_IN); i++) {
    const char* symbol = _YAML__SYMBOLS_IN[i].symbol;
    u32 len = strlen(symbol);
    if (yaml->cur + len <= yaml->data.len &&
        0 == strncmp(yaml->data.str + yaml->cur, symbol, len)) {
      // Make sure it's a complete word (followed by whitespace, colon, newline, or EOF)
      if (yaml->cur + len >= yaml->data.len ||
          _Yaml__is_whitespace(yaml->data.str[yaml->cur + len]) ||
          _Yaml__is_newline(yaml->data.str[yaml->cur + len]) ||
          yaml->data.str[yaml->cur + len] == ':') {
        yaml->cur += len;
        yaml->col += len;
        yaml->token = _YAML__SYMBOLS_IN[i].token;
        return true;
      }
    }
  }

  // Try to read as number
  char* endptr = NULL;
  yaml->token_value.number = strtod(yaml->data.str + yaml->cur, &endptr);
  if (endptr != yaml->data.str + yaml->cur) {
    // Make sure number is followed by appropriate delimiter
    char next = *endptr;
    if (endptr >= yaml->data.str + yaml->data.len || _Yaml__is_whitespace(next) ||
        _Yaml__is_newline(next) || next == ':' || next == YAML_HASH) {
      yaml->col += endptr - (yaml->data.str + yaml->cur);
      yaml->cur = endptr - yaml->data.str;
      yaml->token = YAML_NUMBER;
      return true;
    }
  }

  // Unquoted string
  return _Yaml__read_unquoted_string(yaml);
}

// Public API

// Initialize parser
void Yaml__init(Yaml* yaml, const char* data, u32 len, const char* file_path) {
  yaml->data.str = (char*)data;
  yaml->data.len = len;
  yaml->cur = 0;
  yaml->token = YAML_INVALID;
  yaml->indent = 0;
  yaml->indent_depth = 0;
  yaml->file_path = file_path ? file_path : "<input>";
  yaml->line = 0;
  yaml->col = 0;

  // Skip initial whitespace and document markers
  yaml->indent = _Yaml__count_indent(yaml);
  yaml->cur = yaml->indent;
  yaml->col = yaml->indent;
}

// Get next token
bool Yaml__next(Yaml* yaml) {
  return _Yaml__next_token(yaml);
}

// Read string value
bool Yaml__string(Yaml* yaml, Str8* str) {
  // Skip newlines first
  while (yaml->cur < yaml->data.len && _Yaml__is_newline(yaml->data.str[yaml->cur])) {
    if (yaml->data.str[yaml->cur] == YAML_CR)
      yaml->cur++;
    if (yaml->cur < yaml->data.len && yaml->data.str[yaml->cur] == YAML_LF) {
      yaml->cur++;
      yaml->line++;
      yaml->col = 0;
    }
    yaml->indent = _Yaml__count_indent(yaml);
    yaml->cur += yaml->indent;
    yaml->col = yaml->indent;
  }
  if (!_Yaml__next_token(yaml))
    return false;
  if (yaml->token != YAML_STRING) {
    _Yaml__expected(yaml, YAML_STRING);
    return false;
  }
  *str = yaml->token_value.str;
  return true;
}

// Read number value
bool Yaml__number(Yaml* yaml, f64* number) {
  if (!_Yaml__next_token(yaml))
    return false;
  if (yaml->token != YAML_NUMBER) {
    _Yaml__expected(yaml, YAML_NUMBER);
    return false;
  }
  *number = yaml->token_value.number;
  return true;
}

// Read boolean
bool Yaml__bool(Yaml* yaml, bool* value) {
  if (!_Yaml__next_token(yaml))
    return false;
  if (yaml->token == YAML_TRUE) {
    *value = true;
    return true;
  }
  if (yaml->token == YAML_FALSE) {
    *value = false;
    return true;
  }
  _Yaml__errorf(yaml, "YAML Parse Error: expected boolean");
  return false;
}

// Check if current token is a key (string followed by colon)
bool Yaml__is_key(Yaml* yaml) {
  u32 save_cur = yaml->cur;
  u32 save_line = yaml->line;
  u32 save_col = yaml->col;
  YamlTok save_token = yaml->token;

  bool result = false;
  if (_Yaml__next_token(yaml) && yaml->token == YAML_STRING) {
    _Yaml__skip_inline_whitespace(yaml);
    if (yaml->cur < yaml->data.len && yaml->data.str[yaml->cur] == ':') {
      result = true;
    }
  }

  // Restore state
  yaml->cur = save_cur;
  yaml->line = save_line;
  yaml->col = save_col;
  yaml->token = save_token;
  return result;
}

// Read a key (string before colon)
bool Yaml__key(Yaml* yaml, Str8* key) {
  // Skip past newlines to find next key
  while (_Yaml__next_token(yaml) && yaml->token == YAML_NEWLINE) {
    // keep skipping newlines
  }
  if (yaml->token == YAML_EOF)
    return false;
  if (yaml->token != YAML_STRING) {
    _Yaml__expected(yaml, YAML_STRING);
    return false;
  }
  *key = yaml->token_value.str;

  // Expect colon
  _Yaml__skip_inline_whitespace(yaml);
  if (yaml->cur >= yaml->data.len || yaml->data.str[yaml->cur] != ':') {
    _Yaml__errorf(yaml, "YAML Parse Error: expected ':' after key");
    return false;
  }
  yaml->cur++;
  yaml->col++;
  _Yaml__skip_inline_whitespace(yaml);
  return true;
}

// Check if at a specific key
bool Yaml__key_is(Yaml* yaml, const char* expected) {
  Str8 key = {0};
  u32 save_cur = yaml->cur;
  u32 save_line = yaml->line;
  u32 save_col = yaml->col;

  if (Yaml__key(yaml, &key)) {
    if (key.len == strlen(expected) && 0 == strncmp(key.str, expected, key.len)) {
      return true;
    }
  }

  // Restore if no match
  yaml->cur = save_cur;
  yaml->line = save_line;
  yaml->col = save_col;
  return false;
}

// Read a string value after key
bool Yaml__key_string(Yaml* yaml, const char* key, char* out, u32 out_sz) {
  if (!Yaml__key_is(yaml, key))
    return false;
  Str8 val = {0};
  if (!Yaml__string(yaml, &val))
    return false;
  u32 copy_len = val.len < out_sz - 1 ? val.len : out_sz - 1;
  memcpy(out, val.str, copy_len);
  out[copy_len] = '\0';
  return true;
}

// Skip current value (for unknown keys)
bool Yaml__skip_value(Yaml* yaml) {
  u16 start_indent = yaml->indent;

  // Skip the current line
  while (yaml->cur < yaml->data.len && !_Yaml__is_newline(yaml->data.str[yaml->cur])) {
    yaml->cur++;
    yaml->col++;
  }

  // Skip nested content (lines with greater indentation)
  while (yaml->cur < yaml->data.len) {
    // Skip newline
    if (yaml->data.str[yaml->cur] == YAML_CR)
      yaml->cur++;
    if (yaml->cur < yaml->data.len && yaml->data.str[yaml->cur] == YAML_LF) {
      yaml->cur++;
      yaml->line++;
      yaml->col = 0;
    }

    u16 line_indent = _Yaml__count_indent(yaml);

    // Skip blank lines
    if (yaml->cur + line_indent < yaml->data.len &&
        _Yaml__is_newline(yaml->data.str[yaml->cur + line_indent])) {
      yaml->cur += line_indent;
      continue;
    }

    // Stop if back to same or lower indentation
    if (line_indent <= start_indent) {
      // Check if this is a list item at the same level (still part of the value)
      // In YAML, list items at the same indentation as their parent key are the value
      u32 check_pos = yaml->cur + line_indent;
      if (line_indent == start_indent && check_pos < yaml->data.len &&
          yaml->data.str[check_pos] == '-' && check_pos + 1 < yaml->data.len &&
          _Yaml__is_whitespace(yaml->data.str[check_pos + 1])) {
        // This is a list item - continue skipping (don't break)
      } else {
        yaml->indent = line_indent;
        break;
      }
    }

    // Skip this line
    yaml->cur += line_indent;
    yaml->col = line_indent;
    while (yaml->cur < yaml->data.len && !_Yaml__is_newline(yaml->data.str[yaml->cur])) {
      yaml->cur++;
      yaml->col++;
    }
  }

  return true;
}

// Check if at list item (-)
bool Yaml__is_list_item(Yaml* yaml) {
  u32 pos = yaml->cur;
  while (pos < yaml->data.len && yaml->data.str[pos] == YAML_SPACE) pos++;
  return pos < yaml->data.len && yaml->data.str[pos] == '-' && pos + 1 < yaml->data.len &&
         _Yaml__is_whitespace(yaml->data.str[pos + 1]);
}

// Consume list item marker
bool Yaml__list_item(Yaml* yaml) {
  _Yaml__skip_inline_whitespace(yaml);
  if (yaml->cur >= yaml->data.len || yaml->data.str[yaml->cur] != '-') {
    return false;
  }
  yaml->cur++;
  yaml->col++;
  _Yaml__skip_inline_whitespace(yaml);
  return true;
}

// ---
// YAML Flow Syntax Parser
// Converts YAML flow syntax "key: value, key2: value2" to JSON {"key": "value", "key2": "value2"}
// Handles quoted and unquoted values, whitespace around colons and commas

bool Yaml__flowToJson(const char* flow, char* json, size_t json_sz) {
  if (!flow || !json || json_sz < 3) {
    return false;
  }

  json[0] = '{';
  json[1] = '\0';
  size_t json_len = 1;

  const char* p = flow;
  bool first = true;

  while (*p) {
    // Skip whitespace and commas
    while (*p == ' ' || *p == ',') p++;
    if (!*p)
      break;

    // Read key (until colon)
    const char* key_start = p;
    while (*p && *p != ':') p++;
    if (!*p)
      break;

    // Trim trailing whitespace from key
    const char* key_end = p;
    while (key_end > key_start && *(key_end - 1) == ' ') key_end--;
    size_t key_len = key_end - key_start;

    p++;  // skip ':'
    while (*p == ' ') p++;  // skip whitespace after colon

    // Read value (until comma or end)
    const char* val_start = p;
    bool in_quote = (*p == '"');
    if (in_quote)
      val_start = ++p;

    while (*p) {
      if (in_quote && *p == '"')
        break;
      if (!in_quote && (*p == ',' || *p == '\0'))
        break;
      p++;
    }

    // Trim trailing whitespace from unquoted value
    const char* val_end = p;
    if (!in_quote) {
      while (val_end > val_start && *(val_end - 1) == ' ') val_end--;
    }
    size_t val_len = val_end - val_start;

    if (in_quote && *p == '"')
      p++;

    // Append to JSON
    // Need: ", \"key\": \"value\""
    size_t needed = (first ? 0 : 2) + 1 + key_len + 1 + 2 + 1 + val_len + 1;
    if (json_len + needed >= json_sz - 2) {
      // Buffer too small
      break;
    }

    if (!first) {
      strcat(json, ", ");
      json_len += 2;
    }
    first = false;

    strcat(json, "\"");
    strncat(json, key_start, key_len);
    strcat(json, "\": \"");
    strncat(json, val_start, val_len);
    strcat(json, "\"");
    json_len = strlen(json);
  }

  strcat(json, "}");
  return true;
}
