#define ENGINE_TEST
#include "../../../../../src/unity.h"

int main() {
  LOG_INFOF("=== Template Nested Workers Test ===");

  // Test 1: Load a test template with nested workers structure
  LOG_INFOF("\n[TEST 1] Load test template with per-tool workers");

  // Create a temporary test file
  FILE* f = fopen("test_nested_workers.yaml", "w");
  if (!f) {
    LOG_ERRORF("FAIL: Could not create test file");
    return 1;
  }

  fputs("---\n"
    "apiVersion: daemon/v1\n"
    "kind: Agent\n"
    "metadata:\n"
    "  model: xai:test\n"
    "  tools:\n"
    "    - name: shell__exec\n"
    "      workers:\n"
    "        - pbl1\n"
    "    - name: shell__ls\n"
    "      workers:\n"
    "        - pbl1\n"
    "        - pbl2\n"
    "spec:\n"
    "  system_prompt: test\n", f);
  fclose(f);

  AgentTemplate tmpl = {0};
  if (!AgentTemplate__load(&tmpl, "test_nested_workers.yaml")) {
    LOG_ERRORF("FAIL: Could not load test template");
    unlink("test_nested_workers.yaml");
    return 1;
  }
  LOG_INFOF("✅ Template loaded successfully");
  unlink("test_nested_workers.yaml");

  // Test 2: Verify tool count
  LOG_INFOF("\n[TEST 2] Check tool count");
  if (tmpl.metadata.tool_count != 2) {
    LOG_ERRORF("FAIL: Expected 2 tools, got %u", tmpl.metadata.tool_count);
    return 1;
  }
  LOG_INFOF("✅ tool_count = 2");

  // Test 3: Verify first tool (shell__exec with 1 worker)
  LOG_INFOF("\n[TEST 3] Check first tool");
  AgentTool* tool1 = &tmpl.metadata.tools[0];
  if (strcmp(tool1->name, "shell__exec") != 0) {
    LOG_ERRORF("FAIL: Expected 'shell__exec', got '%s'", tool1->name);
    return 1;
  }
  LOG_INFOF("✅ tool[0].name = %s", tool1->name);

  if (tool1->worker_count != 1) {
    LOG_ERRORF("FAIL: Expected 1 worker for shell__exec, got %u", tool1->worker_count);
    return 1;
  }
  LOG_INFOF("✅ tool[0].worker_count = 1");

  if (strcmp(tool1->workers[0], "pbl1") != 0) {
    LOG_ERRORF("FAIL: Expected 'pbl1', got '%s'", tool1->workers[0]);
    return 1;
  }
  LOG_INFOF("✅ tool[0].workers[0] = %s", tool1->workers[0]);

  // Test 4: Verify second tool (shell__ls with 2 workers)
  LOG_INFOF("\n[TEST 4] Check second tool");
  AgentTool* tool2 = &tmpl.metadata.tools[1];
  if (strcmp(tool2->name, "shell__ls") != 0) {
    LOG_ERRORF("FAIL: Expected 'shell__ls', got '%s'", tool2->name);
    return 1;
  }
  LOG_INFOF("✅ tool[1].name = %s", tool2->name);

  if (tool2->worker_count != 2) {
    LOG_ERRORF("FAIL: Expected 2 workers for shell__ls, got %u", tool2->worker_count);
    return 1;
  }
  LOG_INFOF("✅ tool[1].worker_count = 2");

  if (strcmp(tool2->workers[0], "pbl1") != 0) {
    LOG_ERRORF("FAIL: Expected 'pbl1', got '%s'", tool2->workers[0]);
    return 1;
  }
  LOG_INFOF("✅ tool[1].workers[0] = %s", tool2->workers[0]);

  if (strcmp(tool2->workers[1], "pbl2") != 0) {
    LOG_ERRORF("FAIL: Expected 'pbl2', got '%s'", tool2->workers[1]);
    return 1;
  }
  LOG_INFOF("✅ tool[1].workers[1] = %s", tool2->workers[1]);

  LOG_INFOF("\n=== ALL TESTS PASSED ===");
  return 0;
}
