// Agent Template Unit Test
// Usage: TEST=Template make test

#define ENGINE_TEST
#include "../../../../../src/unity.h"

void test_load_solo_template(void) {
  AgentTemplate tmpl = {0};
  
  // Load the test template (simpler than solo)
  bool loaded = AgentTemplate__load(&tmpl, "assets/agent/templates/test.yaml");
  ASSERT(loaded);
  
  // Check basic fields
  ASSERT(0 == strcmp(tmpl.apiVersion, "daemon/v1"));
  ASSERT(0 == strcmp(tmpl.kind, "Agent"));
  
  // Check metadata
  ASSERT(tmpl.metadata.model[0] != '\0');  // should have a model
  LOG_INFOF("model: %s", tmpl.metadata.model);
  
  // Check tools were parsed
  ASSERT(tmpl.metadata.tool_count > 0);
  LOG_INFOF("tool_count: %u", tmpl.metadata.tool_count);
  
  // Check for specific tools we know are in solo.yaml
  bool has_shell_execute = false;
  bool has_web_fetch = false;
  for (u8 i = 0; i < tmpl.metadata.tool_count; i++) {
    if (0 == strcmp(tmpl.metadata.tools[i].name, "shell__execute")) {
      has_shell_execute = true;
    }
    if (0 == strcmp(tmpl.metadata.tools[i].name, "web__fetch")) {
      has_web_fetch = true;
    }
  }
  ASSERT(has_shell_execute);
  ASSERT(has_web_fetch);
  
  // Check system_prompt was parsed (block scalar)
  ASSERT(tmpl.spec.system_prompt[0] != '\0');
  LOG_INFOF("system_prompt len: %lu", strlen(tmpl.spec.system_prompt));
  
  // Print for verification
  AgentTemplate__print(&tmpl);
  
  LOG_INFOF("test_load_solo_template PASSED");
}

void test_load_by_name(void) {
  AgentTemplate tmpl = {0};
  
  bool loaded = AgentTemplate__load_by_name(&tmpl, "solo");
  ASSERT(loaded);
  ASSERT(0 == strcmp(tmpl.apiVersion, "daemon/v1"));
  
  LOG_INFOF("test_load_by_name PASSED");
}

void test_load_nonexistent(void) {
  AgentTemplate tmpl = {0};
  
  bool loaded = AgentTemplate__load(&tmpl, "assets/agent/templates/nonexistent.yaml");
  ASSERT(!loaded);
  
  LOG_INFOF("test_load_nonexistent PASSED");
}

int main(void) {
  LOG_INFOF("=== Agent Template Tests ===");
  
  test_load_solo_template();
  test_load_by_name();
  test_load_nonexistent();
  
  LOG_INFOF("=== All Template tests passed! ===");
  return 0;
}
