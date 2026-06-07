#define ENGINE_TEST
#include "../../../../../src/unity.h"

// @describe TemplateSystemPrompt
// @tag agent
int main() {
  LOG_INFOF("=== Template System Prompt Parsing Test ===");

  // Use static to avoid stack overflow (AgentTemplate is very large due to AgentSpec.messages)
  static AgentTemplate tmpl;

  // ---
  // Scenario: Parse system_prompt from home.yaml
  {
    LOG_INFOF("\n[TEST 1] Load home.yaml and check system_prompt");

    memset(&tmpl, 0, sizeof(tmpl));
    if (!AgentTemplate__load(&tmpl, "assets/agent/templates/home.yaml")) {
      LOG_ERRORF("FAIL: Could not load home.yaml");
      return 1;
    }
    LOG_INFOF("✅ Template loaded");

    // Check system_prompt was parsed
    LOG_INFOF("system_prompt length: %zu", strlen(tmpl.spec.system_prompt));
    LOG_INFOF(
        "system_prompt[0]: '%c' (0x%02x)",
        tmpl.spec.system_prompt[0],
        (unsigned char)tmpl.spec.system_prompt[0]);

    if (tmpl.spec.system_prompt[0] == '\0') {
      LOG_ERRORF("FAIL: system_prompt is empty!");
      LOG_ERRORF("Expected system_prompt to contain 'You are a personal assistant'");
      return 1;
    }
    LOG_INFOF("✅ system_prompt is not empty");

    // Verify content starts correctly
    if (strstr(tmpl.spec.system_prompt, "personal assistant") == NULL) {
      LOG_ERRORF("FAIL: system_prompt doesn't contain expected text");
      LOG_ERRORF("Got: %.100s", tmpl.spec.system_prompt);
      return 1;
    }
    LOG_INFOF("✅ system_prompt contains expected text");

    // Print first 300 chars for debugging
    LOG_INFOF("system_prompt preview:\n---\n%.300s\n---", tmpl.spec.system_prompt);
  }

  // ---
  // Scenario: Parse system_prompt with block scalar (|)
  {
    LOG_INFOF("\n[TEST 2] Test block scalar parsing directly");

    // Create a minimal test file with block scalar
    FILE* f = fopen("test_block_scalar.yaml", "w");
    if (!f) {
      LOG_ERRORF("FAIL: Could not create test file");
      return 1;
    }

    fputs(
        "---\n"
        "apiVersion: daemon/v1\n"
        "kind: Agent\n"
        "metadata:\n"
        "  model: xai:test\n"
        "  tools:\n"
        "  - shell__exec\n"
        "spec:\n"
        "  system_prompt: |\n"
        "    This is line one.\n"
        "    This is line two.\n"
        "    This is line three.\n",
        f);
    fclose(f);

    memset(&tmpl, 0, sizeof(tmpl));
    if (!AgentTemplate__load(&tmpl, "test_block_scalar.yaml")) {
      LOG_ERRORF("FAIL: Could not load test_block_scalar.yaml");
      unlink("test_block_scalar.yaml");
      return 1;
    }
    unlink("test_block_scalar.yaml");

    LOG_INFOF("system_prompt length: %zu", strlen(tmpl.spec.system_prompt));

    if (tmpl.spec.system_prompt[0] == '\0') {
      LOG_ERRORF("FAIL: system_prompt is empty for block scalar!");
      return 1;
    }
    LOG_INFOF("✅ Block scalar system_prompt parsed");
    LOG_INFOF("Content:\n---\n%s\n---", tmpl.spec.system_prompt);

    if (strstr(tmpl.spec.system_prompt, "line one") == NULL) {
      LOG_ERRORF("FAIL: Block scalar content incorrect");
      return 1;
    }
    LOG_INFOF("✅ Block scalar content verified");
  }

  LOG_INFOF("\n=== ALL TESTS PASSED ===");
  return 0;
}
