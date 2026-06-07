#pragma once

#include "../../../../unity.h"  // IWYU pragma: keep

// Helper: compare Str8 with C string
static bool _Template__str8_eq(Str8* s, const char* cstr) {
  u32 len = strlen(cstr);
  return s->len == len && 0 == strncmp(s->str, cstr, len);
}

// Load an agent template from YAML file
bool AgentTemplate__load(AgentTemplate* tmpl, const char* path) {
  memset(tmpl, 0, sizeof(AgentTemplate));

  // Read file using standard C
  FILE* f = fopen(path, "rb");
  if (!f) {
    LOG_ERRORF("AgentTemplate: failed to open %s", path);
    return false;
  }
  fseek(f, 0, SEEK_END);
  long fsize = ftell(f);
  fseek(f, 0, SEEK_SET);

  char* content = (char*)malloc(fsize + 1);
  if (!content) {
    fclose(f);
    LOG_ERRORF("AgentTemplate: malloc failed for %s", path);
    return false;
  }
  fread(content, 1, fsize, f);
  fclose(f);
  content[fsize] = '\0';

  Yaml yaml = {0};
  Yaml__init(&yaml, content, fsize, path);

  // Parse top-level keys
  Str8 key = {0};
  while (yaml.cur < yaml.data.len) {
    if (!Yaml__key(&yaml, &key))
      break;

    if (_Template__str8_eq(&key, "apiVersion")) {
      Str8 val = {0};
      if (Yaml__string(&yaml, &val)) {
        u32 copy_len =
            val.len < sizeof(tmpl->apiVersion) - 1 ? val.len : sizeof(tmpl->apiVersion) - 1;
        memcpy(tmpl->apiVersion, val.str, copy_len);
        tmpl->apiVersion[copy_len] = '\0';
      }
    } else if (_Template__str8_eq(&key, "kind")) {
      Str8 val = {0};
      if (Yaml__string(&yaml, &val)) {
        u32 copy_len = val.len < sizeof(tmpl->kind) - 1 ? val.len : sizeof(tmpl->kind) - 1;
        memcpy(tmpl->kind, val.str, copy_len);
        tmpl->kind[copy_len] = '\0';
      }
    } else if (_Template__str8_eq(&key, "metadata")) {
      // Parse metadata nested object
      u16 parent_indent = yaml.indent;
      u16 nested_indent = 0;

      while (yaml.cur < yaml.data.len) {
        // Save state for potential rollback if we exit the nested block
        u32 saved_cur = yaml.cur;
        u32 saved_line = yaml.line;
        u32 saved_col = yaml.col;
        u16 saved_indent = yaml.indent;

        if (!Yaml__key(&yaml, &key))
          break;

        // After parsing key, yaml.indent reflects that key's indentation
        if (nested_indent == 0) {
          // First nested key - record the nested indentation level
          nested_indent = yaml.indent;
          if (nested_indent <= parent_indent) {
            // No nested content (empty block or same-level key)
            yaml.cur = saved_cur;
            yaml.line = saved_line;
            yaml.col = saved_col;
            yaml.indent = saved_indent;
            break;
          }
        } else if (yaml.indent < nested_indent) {
          // Dedented - this key belongs to parent level
          yaml.cur = saved_cur;
          yaml.line = saved_line;
          yaml.col = saved_col;
          yaml.indent = saved_indent;
          break;
        }

        if (_Template__str8_eq(&key, "name")) {
          Str8 val = {0};
          if (Yaml__string(&yaml, &val)) {
            u32 copy_len = val.len < sizeof(tmpl->metadata.name) - 1
                               ? val.len
                               : sizeof(tmpl->metadata.name) - 1;
            memcpy(tmpl->metadata.name, val.str, copy_len);
            tmpl->metadata.name[copy_len] = '\0';
          }
        } else if (_Template__str8_eq(&key, "description")) {
          Str8 val = {0};
          if (Yaml__string(&yaml, &val)) {
            u32 copy_len = val.len < sizeof(tmpl->metadata.description) - 1
                               ? val.len
                               : sizeof(tmpl->metadata.description) - 1;
            memcpy(tmpl->metadata.description, val.str, copy_len);
            tmpl->metadata.description[copy_len] = '\0';
          }
        } else if (_Template__str8_eq(&key, "model")) {
          Str8 val = {0};
          if (Yaml__string(&yaml, &val)) {
            u32 copy_len = val.len < sizeof(tmpl->metadata.model) - 1
                               ? val.len
                               : sizeof(tmpl->metadata.model) - 1;
            memcpy(tmpl->metadata.model, val.str, copy_len);
            tmpl->metadata.model[copy_len] = '\0';
          }
        } else if (_Template__str8_eq(&key, "tools")) {
          // Parse tools list - each item can be:
          // - a simple string (tool name), or
          // - an object with {name, workers} fields
          u16 tools_indent = yaml.indent;

          // First, advance to find the first list item
          bool need_advance = true;
          while (yaml.cur < yaml.data.len && tmpl->metadata.tool_count < AGENT_MAX_TOOLS) {
            // Only advance if we need to (not if we're already at next list item)
            if (need_advance) {
              Yaml__next(&yaml);
            }
            need_advance = true;  // Reset for next iteration

            if (yaml.token == YAML_EOF)
              break;
            // Break if indent is LESS than tools_indent - we've exited the tools block
            // Check on any token type, not just YAML_NEWLINE, because we might have
            // advanced past a key at a lower indent level
            if (yaml.indent < tools_indent)
              break;
            if (yaml.token != YAML_NEWLINE)
              continue;

            if (!Yaml__is_list_item(&yaml))
              break;
            Yaml__list_item(&yaml);

            AgentTool* tool = &tmpl->metadata.tools[tmpl->metadata.tool_count];
            tool->worker_count = 0;

            // Look ahead to see if this is an object (has "name" key) or simple string
            u64 saved_cur = yaml.cur;
            u16 saved_indent = yaml.indent;
            u32 saved_line = yaml.line;
            u32 saved_col = yaml.col;
            YamlTok saved_token = yaml.token;
            Str8 first_key = {0};
            bool is_object = Yaml__key(&yaml, &first_key);
            yaml.cur = saved_cur;
            yaml.indent = saved_indent;
            yaml.line = saved_line;
            yaml.col = saved_col;
            yaml.token = saved_token;

            if (is_object && _Template__str8_eq(&first_key, "name")) {
              // Object format: {name: ..., workers: [...]}
              Str8 tool_name = {0};
              if (Yaml__key(&yaml, &first_key) && Yaml__string(&yaml, &tool_name)) {
                u32 copy_len =
                    tool_name.len < sizeof(tool->name) - 1 ? tool_name.len : sizeof(tool->name) - 1;
                memcpy(tool->name, tool_name.str, copy_len);
                tool->name[copy_len] = '\0';
              }

              // Parse workers field
              u16 tool_obj_indent = yaml.indent;
              while (yaml.cur < yaml.data.len) {
                Yaml__next(&yaml);
                if (yaml.token == YAML_EOF)
                  break;
                if (yaml.token == YAML_NEWLINE && yaml.indent < tool_obj_indent)
                  break;
                if (yaml.token != YAML_NEWLINE)
                  continue;

                Str8 field_key = {0};
                if (Yaml__key(&yaml, &field_key)) {
                  if (_Template__str8_eq(&field_key, "workers")) {
                    // Parse workers list
                    u16 workers_indent = yaml.indent;
                    while (yaml.cur < yaml.data.len &&
                           tool->worker_count < AGENT_MAX_TOOL_WORKERS) {
                      Yaml__next(&yaml);
                      if (yaml.token == YAML_EOF)
                        break;
                      // Break only if indent is LESS than workers_indent
                      if (yaml.token == YAML_NEWLINE && yaml.indent < workers_indent)
                        break;
                      if (yaml.token != YAML_NEWLINE)
                        continue;

                      if (Yaml__is_list_item(&yaml)) {
                        Yaml__list_item(&yaml);
                        Str8 worker = {0};
                        if (Yaml__string(&yaml, &worker)) {
                          u32 copy_len = worker.len < 63 ? worker.len : 63;
                          memcpy(tool->workers[tool->worker_count], worker.str, copy_len);
                          tool->workers[tool->worker_count][copy_len] = '\0';
                          tool->worker_count++;
                        }
                      }
                    }
                    break;
                  }
                }
              }
              // After parsing workers, check if we're at the next tool's list item
              // If so, don't advance in the outer loop
              if (yaml.token == YAML_NEWLINE && yaml.indent >= tools_indent &&
                  Yaml__is_list_item(&yaml)) {
                need_advance = false;
              }
              // If we've exited to a lower indent level, we need to break out of the tools loop
              if (yaml.indent < tools_indent) {
                tmpl->metadata.tool_count++;  // Count this tool before breaking
                break;  // Exit tools loop
              }
            } else {
              // Simple string format - just tool name
              Str8 tool_name = {0};
              if (Yaml__string(&yaml, &tool_name)) {
                u32 copy_len =
                    tool_name.len < sizeof(tool->name) - 1 ? tool_name.len : sizeof(tool->name) - 1;
                memcpy(tool->name, tool_name.str, copy_len);
                tool->name[copy_len] = '\0';
              }
            }
            tmpl->metadata.tool_count++;
          }
        } else {
          // Skip unknown metadata keys
          Yaml__skip_value(&yaml);
        }
      }
    } else if (_Template__str8_eq(&key, "spec")) {
      // Parse spec nested object
      u16 parent_indent = yaml.indent;
      u16 nested_indent = 0;

      while (yaml.cur < yaml.data.len) {
        // Save state for potential rollback if we exit the nested block
        u32 saved_cur = yaml.cur;
        u32 saved_line = yaml.line;
        u32 saved_col = yaml.col;
        u16 saved_indent = yaml.indent;

        if (!Yaml__key(&yaml, &key))
          break;

        // After parsing key, yaml.indent reflects that key's indentation
        if (nested_indent == 0) {
          nested_indent = yaml.indent;
          if (nested_indent <= parent_indent) {
            yaml.cur = saved_cur;
            yaml.line = saved_line;
            yaml.col = saved_col;
            yaml.indent = saved_indent;
            break;
          }
        } else if (yaml.indent < nested_indent) {
          yaml.cur = saved_cur;
          yaml.line = saved_line;
          yaml.col = saved_col;
          yaml.indent = saved_indent;
          break;
        }

        if (_Template__str8_eq(&key, "system_prompt")) {
          Str8 val = {0};
          if (Yaml__string(&yaml, &val)) {
            u32 copy_len = val.len < sizeof(tmpl->spec.system_prompt) - 1
                               ? val.len
                               : sizeof(tmpl->spec.system_prompt) - 1;
            memcpy(tmpl->spec.system_prompt, val.str, copy_len);
            tmpl->spec.system_prompt[copy_len] = '\0';
          }
        } else {
          Yaml__skip_value(&yaml);
        }
      }
    } else {
      // Skip unknown top-level keys
      Yaml__skip_value(&yaml);
    }
  }

  // Validate required fields
  if (tmpl->apiVersion[0] == '\0' || tmpl->kind[0] == '\0') {
    LOG_ERRORF("AgentTemplate: missing apiVersion or kind in %s", path);
    free(content);
    return false;
  }

  free(content);
  return true;
}

// Load template by name from assets/agent/templates/{name}.yaml
bool AgentTemplate__load_by_name(AgentTemplate* tmpl, const char* name) {
  char path[256];
  snprintf(path, sizeof(path), "assets/agent/templates/%s.yaml", name);
  return AgentTemplate__load(tmpl, path);
}

// Debug: print template info
void AgentTemplate__print(AgentTemplate* tmpl) {
  LOG_INFOF("Template: apiVersion=%s kind=%s", tmpl->apiVersion, tmpl->kind);
  LOG_INFOF("  name=%s model=%s", tmpl->metadata.name, tmpl->metadata.model);
  LOG_INFOF("  description=%s", tmpl->metadata.description);
  LOG_INFOF("  tools[%u]:", tmpl->metadata.tool_count);
  for (u8 i = 0; i < tmpl->metadata.tool_count; i++) {
    LOG_INFOF("    - %s", tmpl->metadata.tools[i].name);
    if (tmpl->metadata.tools[i].worker_count > 0) {
      LOG_INFOF("      workers[%u]:", tmpl->metadata.tools[i].worker_count);
      for (u8 w = 0; w < tmpl->metadata.tools[i].worker_count; w++) {
        LOG_INFOF("        - %s", tmpl->metadata.tools[i].workers[w]);
      }
    }
  }
  if (tmpl->spec.system_prompt[0]) {
    LOG_INFOF("  system_prompt: (%.60s...)", tmpl->spec.system_prompt);
  }
}
