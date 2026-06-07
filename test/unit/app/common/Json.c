#define ENGINE_TEST
#include "../../../../src/unity.h"  // IWYU pragma: keep

// @describe Json
// @tag common
int main() {
  Json json = {0};
  json.file_path = "internal";
  json.data = (Str8){0, 0, false, false, STR_STATIC};
  json.data.str =
      "{ \n"
      "  \"pet\": {\n"
      "    \"kind\": \"hamster\",\n"
      "    \"name\": \"Jimmy\",\n"
      "    \"age\": 2\n"
      "  },\n"
      "  \"a\": [3,4,5]\n"
      "}\n";
  json.data.len = strlen(json.data.str);

  // clang-format off
  bool r;
  Str8 key = {0}, val = {0};
  f64 nval;
  r = Json__object_begin(&json);
  ASSERT(r);
    r = Json__object_key(&json, &key);
    ASSERT(r);
    ASSERT(0 == strncmp("pet", key.str, 3));
    ASSERT(3 == key.len);
    r = Json__object_begin(&json);
    ASSERT(r);
      r = Json__object_key(&json, &key);
      ASSERT(r);
      ASSERT(0 == strncmp("kind", key.str, 4));
      r = Json__string(&json, &val);
      ASSERT(r);
      ASSERT(0 == strncmp("hamster", val.str, 7));

      r = Json__object_key(&json, &key);
      ASSERT(r);
      ASSERT(0 == strncmp("name", key.str, 4));
      r = Json__string(&json, &val);
      ASSERT(r);
      ASSERT(0 == strncmp("Jimmy", val.str, 5));

      r = Json__object_key(&json, &key);
      ASSERT(r);
      ASSERT(0 == strncmp("age", key.str, 3));
      r = Json__number(&json, &nval);
      ASSERT(r);
      ASSERT(2.0 == nval);

    r = Json__object_end(&json);
    ASSERT(r);
    r = Json__object_key(&json, &key);
    ASSERT(r);
    ASSERT(0 == strncmp("a", key.str, 1));
    r = Json__array_begin(&json);
    ASSERT(r);
      r = Json__array_item(&json);
      ASSERT(r);
      r = Json__number(&json, &nval);
      ASSERT(r);
      ASSERT(3.0 == nval);

      r = Json__array_item(&json);
      ASSERT(r);
      r = Json__number(&json, &nval);
      ASSERT(r);
      ASSERT(4.0 == nval);

      r = Json__array_item(&json);
      ASSERT(r);
      r = Json__number(&json, &nval);
      ASSERT(r);
      ASSERT(5.0 == nval);

    r = Json__array_end(&json);
    ASSERT(r);
  r = Json__object_end(&json);
  ASSERT(r);
  // clang-format on

  return 0;
}