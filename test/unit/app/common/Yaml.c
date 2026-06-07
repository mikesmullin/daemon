// YAML Parser Unit Test
// Usage: TEST=Yaml make test

#define ENGINE_TEST
#include "../../../../src/unity.h"

// Test basic key-value parsing
void test_key_value(void) {
  const char* yaml_str =
      "apiVersion: daemon/v1\n"
      "kind: Agent\n"
      "name: test-agent\n";

  Yaml yaml = {0};
  Yaml__init(&yaml, yaml_str, strlen(yaml_str), "test.yaml");

  char buf[64] = {0};
  ASSERT(Yaml__key_string(&yaml, "apiVersion", buf, sizeof(buf)));
  ASSERT(0 == strcmp(buf, "daemon/v1"));

  ASSERT(Yaml__key_string(&yaml, "kind", buf, sizeof(buf)));
  ASSERT(0 == strcmp(buf, "Agent"));

  ASSERT(Yaml__key_string(&yaml, "name", buf, sizeof(buf)));
  ASSERT(0 == strcmp(buf, "test-agent"));

  LOG_INFOF("test_key_value PASSED");
}

// Test nested objects (metadata:)
void test_nested_object(void) {
  const char* yaml_str =
      "metadata:\n"
      "  name: solo\n"
      "  description: General purpose agent\n"
      "  model: xai:grok-4-fast-reasoning\n";

  Yaml yaml = {0};
  Yaml__init(&yaml, yaml_str, strlen(yaml_str), "test.yaml");

  Str8 key = {0};
  ASSERT(Yaml__key(&yaml, &key));
  ASSERT(key.len == 8 && 0 == strncmp(key.str, "metadata", 8));

  // Now parse nested keys
  char buf[64] = {0};
  ASSERT(Yaml__key_string(&yaml, "name", buf, sizeof(buf)));
  ASSERT(0 == strcmp(buf, "solo"));

  ASSERT(Yaml__key_string(&yaml, "description", buf, sizeof(buf)));
  ASSERT(0 == strcmp(buf, "General purpose agent"));

  ASSERT(Yaml__key_string(&yaml, "model", buf, sizeof(buf)));
  ASSERT(0 == strcmp(buf, "xai:grok-4-fast-reasoning"));

  LOG_INFOF("test_nested_object PASSED");
}

// Test list items
void test_list(void) {
  const char* yaml_str =
      "tools:\n"
      "  - shell__execute\n"
      "  - fs__file__read\n"
      "  - web__fetch\n";

  Yaml yaml = {0};
  Yaml__init(&yaml, yaml_str, strlen(yaml_str), "test.yaml");

  Str8 key = {0};
  ASSERT(Yaml__key(&yaml, &key));
  ASSERT(key.len == 5 && 0 == strncmp(key.str, "tools", 5));

  // Read first list item
  Yaml__next(&yaml);  // newline
  ASSERT(Yaml__is_list_item(&yaml));
  ASSERT(Yaml__list_item(&yaml));
  Str8 val = {0};
  ASSERT(Yaml__string(&yaml, &val));
  ASSERT(val.len == 14 && 0 == strncmp(val.str, "shell__execute", 14));

  // Read second list item
  Yaml__next(&yaml);  // newline
  ASSERT(Yaml__list_item(&yaml));
  ASSERT(Yaml__string(&yaml, &val));
  ASSERT(val.len == 14 && 0 == strncmp(val.str, "fs__file__read", 14));

  // Read third list item
  Yaml__next(&yaml);  // newline
  ASSERT(Yaml__list_item(&yaml));
  ASSERT(Yaml__string(&yaml, &val));
  ASSERT(val.len == 10 && 0 == strncmp(val.str, "web__fetch", 10));

  LOG_INFOF("test_list PASSED");
}

// Test block scalar (|)
void test_block_scalar(void) {
  const char* yaml_str =
      "system_prompt: |\n"
      "  You are a helpful assistant.\n"
      "  Follow instructions carefully.\n"
      "next_key: value\n";

  Yaml yaml = {0};
  Yaml__init(&yaml, yaml_str, strlen(yaml_str), "test.yaml");

  Str8 key = {0};
  ASSERT(Yaml__key(&yaml, &key));
  ASSERT(key.len == 13 && 0 == strncmp(key.str, "system_prompt", 13));

  Str8 val = {0};
  ASSERT(Yaml__string(&yaml, &val));
  ASSERT(val.len > 0);
  // Block scalar should contain the multiline content
  ASSERT(NULL != strstr(val.str, "helpful assistant"));

  LOG_INFOF("test_block_scalar PASSED");
}

// Test quoted strings
void test_quoted_strings(void) {
  const char* yaml_str =
      "name: \"test with spaces\"\n"
      "desc: 'single quoted'\n";

  Yaml yaml = {0};
  Yaml__init(&yaml, yaml_str, strlen(yaml_str), "test.yaml");

  char buf[64] = {0};
  ASSERT(Yaml__key_string(&yaml, "name", buf, sizeof(buf)));
  ASSERT(0 == strcmp(buf, "test with spaces"));

  ASSERT(Yaml__key_string(&yaml, "desc", buf, sizeof(buf)));
  ASSERT(0 == strcmp(buf, "single quoted"));

  LOG_INFOF("test_quoted_strings PASSED");
}

// Test booleans
void test_booleans(void) {
  const char* yaml_str =
      "enabled: true\n"
      "disabled: false\n"
      "on_val: yes\n"
      "off_val: no\n";

  Yaml yaml = {0};
  Yaml__init(&yaml, yaml_str, strlen(yaml_str), "test.yaml");

  Str8 key = {0};
  bool val = false;

  ASSERT(Yaml__key(&yaml, &key));
  ASSERT(Yaml__bool(&yaml, &val));
  ASSERT(val == true);

  ASSERT(Yaml__key(&yaml, &key));
  ASSERT(Yaml__bool(&yaml, &val));
  ASSERT(val == false);

  ASSERT(Yaml__key(&yaml, &key));
  ASSERT(Yaml__bool(&yaml, &val));
  ASSERT(val == true);

  ASSERT(Yaml__key(&yaml, &key));
  ASSERT(Yaml__bool(&yaml, &val));
  ASSERT(val == false);

  LOG_INFOF("test_booleans PASSED");
}

// Test numbers
void test_numbers(void) {
  const char* yaml_str =
      "port: 6543\n"
      "pi: 3.14159\n"
      "negative: -42\n";

  Yaml yaml = {0};
  Yaml__init(&yaml, yaml_str, strlen(yaml_str), "test.yaml");

  Str8 key = {0};
  f64 val = 0;

  ASSERT(Yaml__key(&yaml, &key));
  ASSERT(Yaml__number(&yaml, &val));
  ASSERT(val == 6543);

  ASSERT(Yaml__key(&yaml, &key));
  ASSERT(Yaml__number(&yaml, &val));
  ASSERT(val > 3.14 && val < 3.15);

  ASSERT(Yaml__key(&yaml, &key));
  ASSERT(Yaml__number(&yaml, &val));
  ASSERT(val == -42);

  LOG_INFOF("test_numbers PASSED");
}

// Test comments
void test_comments(void) {
  const char* yaml_str =
      "# This is a comment\n"
      "name: test  # inline comment\n"
      "value: 42\n";

  Yaml yaml = {0};
  Yaml__init(&yaml, yaml_str, strlen(yaml_str), "test.yaml");

  char buf[64] = {0};
  ASSERT(Yaml__key_string(&yaml, "name", buf, sizeof(buf)));
  ASSERT(0 == strcmp(buf, "test"));

  Str8 key = {0};
  f64 val = 0;
  ASSERT(Yaml__key(&yaml, &key));
  ASSERT(Yaml__number(&yaml, &val));
  ASSERT(val == 42);

  LOG_INFOF("test_comments PASSED");
}

int main(void) {
  LOG_INFOF("=== YAML Parser Tests ===");

  test_key_value();
  test_nested_object();
  test_list();
  test_block_scalar();
  test_quoted_strings();
  test_booleans();
  test_numbers();
  test_comments();

  LOG_INFOF("=== All YAML tests passed! ===");
  return 0;
}
