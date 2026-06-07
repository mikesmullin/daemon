#define ENGINE_TEST
#include "../../../../src/unity.h"  // IWYU pragma: keep

// @describe Spawn
// @tag common
int main() {
  // Scenario 1
  {
    char* argv[] = {
        "main",  // argv[0] is conventionally the program name
        // "a",
        // "b",
        // "c",
        NULL};

    // Spawn__detached("build/main", argv);

    // ASSERT(cstr__len(api_key) > 0);
  }

  // Scenario 2
  {
    int r;
    r = Spawn__run("podman", (char*[]){"podman", "ps", NULL});
    r = Spawn__run("git", (char*[]){"git", "worktree", "list", NULL});
  }

  return 0;
}
