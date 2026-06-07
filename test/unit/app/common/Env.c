#define ENGINE_TEST
#include "../../../../src/unity.h"  // IWYU pragma: keep

// @describe Env
// @tag common
int main() {
  char api_key[120] = "";
  Env__get("XAI_API_KEY", api_key);

  ASSERT(cstr__len(api_key) > 0);

  return 0;
}