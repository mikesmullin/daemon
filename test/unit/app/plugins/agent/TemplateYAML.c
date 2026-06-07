#define ENGINE_TEST
#include "../../../../../src/unity.h"

int main() {
  LOG_INFOF("=== Template YAML Parsing Test ===");

  // Test 1: Load home.yaml and verify tools are parsed
  LOG_INFOF("\n[TEST 1] Load home.yaml");
  AgentTemplate tmpl = {0};
  if (!AgentTemplate__load(&tmpl, "assets/agent/templates/home.yaml")) {
    LOG_ERRORF("FAIL: Could not load home template");
    return 1;
  }
  LOG_INFOF("✅ Template loaded: %s", tmpl.apiVersion);

  // Test 2: Verify template metadata
  LOG_INFOF("\n[TEST 2] Check metadata");
  LOG_INFOF("  name: %s", tmpl.metadata.name);
  LOG_INFOF("  model: %s", tmpl.metadata.model);
  LOG_INFOF("  tool_count: %u", tmpl.metadata.tool_count);

  if (tmpl.metadata.tool_count == 0) {
    LOG_ERRORF("FAIL: No tools parsed! tool_count=0");
    return 1;
  }
  LOG_INFOF("✅ tool_count is non-zero: %u", tmpl.metadata.tool_count);

  // Test 3: Verify first tool exists
  LOG_INFOF("\n[TEST 3] Check first tool");
  if (tmpl.metadata.tool_count < 1) {
    LOG_ERRORF("FAIL: No tools available");
    return 1;
  }

  AgentTool* tool = &tmpl.metadata.tools[0];
  LOG_INFOF("  tool[0].name: '%s'", tool->name);
  LOG_INFOF("  tool[0].worker_count: %u", tool->worker_count);

  if (tool->name[0] == '\0') {
    LOG_ERRORF("FAIL: Tool name is empty");
    return 1;
  }
  LOG_INFOF("✅ Tool name parsed: %s", tool->name);

  // Test 4: Verify workers are configured
  LOG_INFOF("\n[TEST 4] Check tool workers");
  if (tool->worker_count == 0) {
    LOG_ERRORF("FAIL: No workers configured for tool '%s'", tool->name);
    return 1;
  }
  LOG_INFOF("✅ worker_count is non-zero: %u", tool->worker_count);

  for (u8 w = 0; w < tool->worker_count; w++) {
    LOG_INFOF("  worker[%u]: %s", w, tool->workers[w]);
  }

  // Test 5: Verify first worker is 'pbl1'
  LOG_INFOF("\n[TEST 5] Check worker name");
  if (strcmp(tool->workers[0], "pbl1") != 0) {
    LOG_ERRORF("FAIL: Expected worker 'pbl1', got '%s'", tool->workers[0]);
    return 1;
  }
  LOG_INFOF("✅ Worker is correctly set to: %s", tool->workers[0]);

  // Test 6: Print full template structure
  LOG_INFOF("\n[TEST 6] Full template structure");
  AgentTemplate__print(&tmpl);

  LOG_INFOF("\n=== ALL TESTS PASSED ===");
  return 0;
}
