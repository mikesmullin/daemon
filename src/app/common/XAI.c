#pragma once

#include "../../unity.h"

// ---
// @class XAI
// xAI API client for chat completions
//
// Function | Purpose
// --- | ---
// XAI__init() | load XAI_API_KEY from environment
// XAI__prompt(model, prompt, res) | simple single-prompt completion request
// XAI__chat(model, messages, msg_count, tools, tool_count) | chat completion with tools support

void XAI__init() {
  Env__get("XAI_API_KEY", _G->XAI_API_KEY);
  ASSERT_CONTEXT(cstr__len(_G->XAI_API_KEY) > 0, "XAI_API_KEY is required.");
}

// Parse finish_reason string to enum
static AgentFinishReason _XAI__parse_finish_reason(const char* str) {
  if (!str)
    return FINISH_REASON_NONE;
  if (strstr(str, "stop"))
    return FINISH_REASON_STOP;
  if (strstr(str, "tool_calls"))
    return FINISH_REASON_TOOL_CALLS;
  if (strstr(str, "length"))
    return FINISH_REASON_LENGTH;
  return FINISH_REASON_NONE;
}

// Parse tool_calls array from JSON response
// Uses Json.c parser for robust JSON handling
static int _XAI__parse_tool_calls(const char* json_str, AgentMessage* msg) {
  msg->tool_call_count = 0;

  // Find "tool_calls" array start position
  const char* tc_start = strstr(json_str, "\"tool_calls\"");
  if (!tc_start)
    return 0;

  const char* arr_start = strchr(tc_start, '[');
  if (!arr_start)
    return 0;

  // Initialize Json parser starting from the array
  Json json = {0};
  json.file_path = "xai_response";
  json.data.str = (char*)arr_start;
  json.data.len = strlen(arr_start);
  json.data.life = STR_STATIC;

  // Suppress errors since we're parsing a partial JSON fragment
  _Json_suppress_errors = true;

  // Parse the tool_calls array
  if (!Json__array_begin(&json)) {
    _Json_suppress_errors = false;
    return 0;
  }

  while (msg->tool_call_count < AGENT_MAX_TOOL_CALLS && Json__array_item(&json)) {
    // Clear the current slot before parsing
    memset(&msg->tool_calls[msg->tool_call_count], 0, sizeof(AgentToolCall));

    // Parse tool call object
    if (!Json__object_begin(&json))
      break;

    Str8 key = {0};
    while (Json__object_key(&json, &key)) {
      if (cstr__eq(2, "id", key.str)) {
        Str8 val = {0};
        if (Json__string(&json, &val)) {
          size_t len = val.len < sizeof(msg->tool_calls[0].id) - 1
                           ? val.len
                           : sizeof(msg->tool_calls[0].id) - 1;
          memcpy(msg->tool_calls[msg->tool_call_count].id, val.str, len);
          msg->tool_calls[msg->tool_call_count].id[len] = '\0';
        }
      } else if (cstr__eq(4, "type", key.str)) {
        // Skip the "type" field (always "function")
        Str8 val = {0};
        Json__string(&json, &val);
      } else if (cstr__eq(8, "function", key.str)) {
        // Parse the function object
        if (!Json__object_begin(&json))
          continue;

        Str8 func_key = {0};
        while (Json__object_key(&json, &func_key)) {
          if (cstr__eq(4, "name", func_key.str)) {
            Str8 val = {0};
            if (Json__string(&json, &val)) {
              size_t len = val.len < sizeof(msg->tool_calls[0].name) - 1
                               ? val.len
                               : sizeof(msg->tool_calls[0].name) - 1;
              memcpy(msg->tool_calls[msg->tool_call_count].name, val.str, len);
              msg->tool_calls[msg->tool_call_count].name[len] = '\0';
            }
          } else if (cstr__eq(9, "arguments", func_key.str)) {
            Str8 val = {0};
            if (Json__string(&json, &val)) {
              // The arguments value is a JSON string that may contain escape sequences
              // Use Json__unescape to properly handle \", \\, \n, etc.
              Str8 dst = {
                  msg->tool_calls[msg->tool_call_count].arguments,
                  sizeof(msg->tool_calls[0].arguments),
                  false,
                  true,
                  STR_STATIC};
              Json__unescape(val, &dst);
            }
          }
        }
        Json__object_end(&json);
      }
    }

    Json__object_end(&json);

    // Only count this as a valid tool call if we got a name
    if (msg->tool_calls[msg->tool_call_count].name[0] != '\0') {
      msg->tool_call_count++;
    }
  }

  Json__array_end(&json);
  _Json_suppress_errors = false;

  return msg->tool_call_count;
}

int XAI__prompt(const char* model, const char* prompt, char* res) {
  CURL* curl;
  CURLcode resCode;
  struct curl_slist* headers = NULL;

  // Reset curlArena before request
  Curl__reset();

  curl = curl_easy_init();
  if (!curl) {
    fprintf(stderr, "curl_easy_init() failed\n");
    return EXIT_FAILURE;
  }

  /* Build the JSON payload */
  char json_payload[4096];
  snprintf(
      json_payload,
      sizeof(json_payload),
      "{"
      "\"model\": \"%s\","
      "\"messages\": ["
      "  {\"role\": \"user\", \"content\": \"%s\"}"
      "],"
      "\"temperature\": 0.7,"
      "\"max_tokens\": 1024"
      "}",
      model,
      prompt);

  /* Set headers */
  char auth_header[256];
  snprintf(auth_header, sizeof(auth_header), "Authorization: Bearer %s", _G->XAI_API_KEY);
  headers = curl_slist_append(headers, "Content-Type: application/json");
  headers = curl_slist_append(headers, auth_header);

  curl_easy_setopt(curl, CURLOPT_URL, "https://api.x.ai/v1/chat/completions");
  curl_easy_setopt(curl, CURLOPT_HTTPHEADER, headers);
  curl_easy_setopt(curl, CURLOPT_POSTFIELDS, json_payload);
  curl_easy_setopt(curl, CURLOPT_WRITEFUNCTION, _Curl__write_callback);
  curl_easy_setopt(curl, CURLOPT_WRITEDATA, NULL);  // curlArena used directly

  /* Perform the request */
  resCode = curl_easy_perform(curl);
  if (resCode != CURLE_OK) {
    fprintf(stderr, "curl_easy_perform() failed: %s\n", curl_easy_strerror(resCode));
  } else {
    long http_code = 0;
    curl_easy_getinfo(curl, CURLINFO_RESPONSE_CODE, &http_code);
    char* data = Curl__data();
    if (http_code == 200 && Curl__size() > 0) {
      /* Simple JSON parsing to extract the content (good enough for this example) */
      const char* content = strstr(data, "\"content\":\"");
      if (content) {
        content += 11; /* skip "content":" */
        const char* end = strstr(content, "\"");
        if (end) {
          u32 len = cstr__len(res);
          u32 len2 = end - content;
          memcpy(res + len, content, len2);
          res[len + len2] = '\0';
        } else {
          u32 len = cstr__len(data);
          memcpy(res, content, len);
          res[len] = '\0';
        }
      } else {
        u32 len = cstr__len(data);
        memcpy(res, content, len);
        res[len] = '\0';
      }
    } else {
      u32 len = Curl__size();
      memcpy(res, data, len);
      res[len] = '\0';
    }
  }

  /* Cleanup */
  curl_slist_free_all(headers);
  curl_easy_cleanup(curl);

  // No free() needed - response from curlArena

  return (resCode == CURLE_OK) ? EXIT_SUCCESS : EXIT_FAILURE;
}

// Chat completion with tools support
// messages: array of messages (system, user, assistant, tool)
// msg_count: number of messages
// tools: array of tool definitions (can be NULL)
// tool_count: number of tools
// response: output response struct
XAIResponse XAI__chat(
    const char* model, AgentMessage* messages, u16 msg_count, XAIToolDef* tools, u8 tool_count) {
  XAIResponse response = {0};
  response.message.role = MSG_ROLE_ASSISTANT;

  CURL* curl = curl_easy_init();
  if (!curl) {
    response.success = false;
    snprintf(response.error, sizeof(response.error), "curl_easy_init() failed");
    return response;
  }

  // Build JSON payload dynamically using frameArena (no free needed)
  char* json_payload = (char*)Arena__Push(_G->frameArena, 64 * 1024);  // 64KB buffer
  char* escaped_buf = (char*)Arena__Push(_G->frameArena, 16 * 1024);  // 16KB for escaped strings
  Str8 escaped = {escaped_buf, 16 * 1024, false, true, STR_ARENA2};

  size_t offset = 0;
  offset += snprintf(
      json_payload + offset,
      64 * 1024 - offset,
      "{\"model\":\"%s\",\"messages\":[",
      model);

  // Add messages
  for (u16 i = 0; i < msg_count; i++) {
    if (i > 0)
      offset += snprintf(json_payload + offset, 64 * 1024 - offset, ",");

    const char* role_str = "user";
    switch (messages[i].role) {
      case MSG_ROLE_SYSTEM:
        role_str = "system";
        break;
      case MSG_ROLE_USER:
        role_str = "user";
        break;
      case MSG_ROLE_ASSISTANT:
        role_str = "assistant";
        break;
      case MSG_ROLE_TOOL:
        role_str = "tool";
        break;
    }

    if (messages[i].role == MSG_ROLE_TOOL) {
      // Tool response message
      Str8 content_src =
          {(char*)messages[i].content, (u16)strlen(messages[i].content), false, false, STR_STATIC};
      escaped.len = 16 * 1024;  // Reset capacity
      Json__escape(content_src, &escaped);
      offset += snprintf(
          json_payload + offset,
          64 * 1024 - offset,
          "{\"role\":\"tool\",\"tool_call_id\":\"%s\",\"content\":\"%s\"}",
          messages[i].tool_call_id,
          escaped.str);
    } else if (messages[i].role == MSG_ROLE_ASSISTANT && messages[i].tool_call_count > 0) {
      // Assistant message with tool_calls
      offset += snprintf(json_payload + offset, 64 * 1024 - offset, "{\"role\":\"assistant\"");

      // Content can be null for tool-calling assistant messages
      if (messages[i].content[0]) {
        Str8 content_src = {
            (char*)messages[i].content,
            (u16)strlen(messages[i].content),
            false,
            false,
            STR_STATIC};
        escaped.len = 16 * 1024;  // Reset capacity
        Json__escape(content_src, &escaped);
        offset +=
            snprintf(json_payload + offset, 64 * 1024 - offset, ",\"content\":\"%s\"", escaped.str);
      } else {
        offset += snprintf(json_payload + offset, 64 * 1024 - offset, ",\"content\":null");
      }

      // Add tool_calls array
      offset += snprintf(json_payload + offset, 64 * 1024 - offset, ",\"tool_calls\":[");
      for (u8 tc = 0; tc < messages[i].tool_call_count; tc++) {
        if (tc > 0)
          offset += snprintf(json_payload + offset, 64 * 1024 - offset, ",");
        Str8 args_src = {
            (char*)messages[i].tool_calls[tc].arguments,
            (u16)strlen(messages[i].tool_calls[tc].arguments),
            false,
            false,
            STR_STATIC};
        escaped.len = 16 * 1024;  // Reset capacity
        Json__escape(args_src, &escaped);
        offset += snprintf(
            json_payload + offset,
            64 * 1024 - offset,
            "{\"id\":\"%s\",\"type\":\"function\",\"function\":{\"name\":\"%s\",\"arguments\":\"%"
            "s\"}}",
            messages[i].tool_calls[tc].id,
            messages[i].tool_calls[tc].name,
            escaped.str);
      }
      offset += snprintf(json_payload + offset, 64 * 1024 - offset, "]}");
    } else {
      // Regular message (system, user, or assistant without tool_calls)
      Str8 content_src =
          {(char*)messages[i].content, (u16)strlen(messages[i].content), false, false, STR_STATIC};
      escaped.len = 16 * 1024;  // Reset capacity
      Json__escape(content_src, &escaped);
      offset += snprintf(
          json_payload + offset,
          64 * 1024 - offset,
          "{\"role\":\"%s\",\"content\":\"%s\"}",
          role_str,
          escaped.str);
    }
  }

  offset += snprintf(json_payload + offset, 64 * 1024 - offset, "]");

  // Add tools if provided
  if (tools && tool_count > 0) {
    offset += snprintf(json_payload + offset, 64 * 1024 - offset, ",\"tools\":[");
    for (u8 t = 0; t < tool_count; t++) {
      if (t > 0)
        offset += snprintf(json_payload + offset, 64 * 1024 - offset, ",");
      Str8 desc_src = {
          (char*)tools[t].description,
          (u16)strlen(tools[t].description),
          false,
          false,
          STR_STATIC};
      escaped.len = 16 * 1024;  // Reset capacity
      Json__escape(desc_src, &escaped);
      offset += snprintf(
          json_payload + offset,
          64 * 1024 - offset,
          "{\"type\":\"function\",\"function\":{\"name\":\"%s\",\"description\":\"%s\","
          "\"parameters\":%s}}",
          tools[t].name,
          escaped.str,
          tools[t].parameters_json);
    }
    offset += snprintf(json_payload + offset, 64 * 1024 - offset, "]");
  }

  offset += snprintf(
      json_payload + offset,
      64 * 1024 - offset,
      ",\"temperature\":0.7,\"max_tokens\":4096}");

  // Setup HTTP request
  struct curl_slist* headers = NULL;
  char auth_header[256];
  snprintf(auth_header, sizeof(auth_header), "Authorization: Bearer %s", _G->XAI_API_KEY);
  headers = curl_slist_append(headers, "Content-Type: application/json");
  headers = curl_slist_append(headers, auth_header);

  // Reset curlArena before request
  Curl__reset();

  curl_easy_setopt(curl, CURLOPT_URL, "https://api.x.ai/v1/chat/completions");
  curl_easy_setopt(curl, CURLOPT_HTTPHEADER, headers);
  curl_easy_setopt(curl, CURLOPT_POSTFIELDS, json_payload);
  curl_easy_setopt(curl, CURLOPT_WRITEFUNCTION, _Curl__write_callback);
  curl_easy_setopt(curl, CURLOPT_WRITEDATA, NULL);  // curlArena used directly

  LOG_VERBOSE(VERBOSITY_XAI, "[XAI] HTTP Request (first 500 chars): %.500s...", json_payload);
  LOG_DEBUGF("XAI Request (first 500 chars): %.500s...", json_payload);

  CURLcode resCode = curl_easy_perform(curl);
  if (resCode != CURLE_OK) {
    response.success = false;
    snprintf(
        response.error,
        sizeof(response.error),
        "curl failed: %s",
        curl_easy_strerror(resCode));
  } else {
    long http_code = 0;
    curl_easy_getinfo(curl, CURLINFO_RESPONSE_CODE, &http_code);

    char* curl_data = Curl__data();
    u32 curl_size = Curl__size();

    LOG_VERBOSE(VERBOSITY_XAI, "[XAI] HTTP Response code=%ld, size=%u", http_code, curl_size);
    LOG_DEBUGF("XAI Response (first 1000 chars): %.1000s", curl_size > 0 ? curl_data : "(null)");

    if (http_code == 200 && curl_size > 0) {
      response.success = true;

      // Parse the response using Json.c
      Json json = {0};
      json.file_path = "xai_response";
      json.data.str = curl_data;
      json.data.len = curl_size;
      json.data.life = STR_ARENA2;  // Allocated from curlArena

      _Json_suppress_errors = true;

      if (Json__object_begin(&json)) {
        Str8 key = {0};
        while (Json__object_key(&json, &key)) {
          if (cstr__eq(7, "choices", key.str)) {
            // Parse choices array - we only care about the first choice
            if (Json__array_begin(&json) && Json__array_item(&json)) {
              if (Json__object_begin(&json)) {
                Str8 choice_key = {0};
                while (Json__object_key(&json, &choice_key)) {
                  if (cstr__eq(7, "message", choice_key.str)) {
                    if (Json__object_begin(&json)) {
                      Str8 msg_key = {0};
                      while (Json__object_key(&json, &msg_key)) {
                        if (cstr__eq(7, "content", msg_key.str)) {
                          Str8 val = {0};
                          if (Json__string(&json, &val)) {
                            Str8 dst = {
                                response.message.content,
                                sizeof(response.message.content),
                                false,
                                true,
                                STR_STATIC};
                            Json__unescape(val, &dst);
                          }
                        } else if (cstr__eq(10, "tool_calls", msg_key.str)) {
                          // tool_calls already parsed later via _XAI__parse_tool_calls
                          // Skip past the array by re-parsing from current position
                          // For now, just skip tokens until we're past the array
                          u32 depth = 1;
                          if (Json__array_begin(&json)) {
                            while (depth > 0 && Json__any(&json)) {
                              if (json.token == JSON_OBRACKET || json.token == JSON_OCURLY)
                                depth++;
                              else if (json.token == JSON_CBRACKET || json.token == JSON_CCURLY)
                                depth--;
                            }
                          }
                        } else {
                          Json__any(&json);  // Skip other fields
                        }
                      }
                      Json__object_end(&json);
                    }
                  } else if (cstr__eq(13, "finish_reason", choice_key.str)) {
                    Str8 val = {0};
                    if (Json__string(&json, &val)) {
                      // Copy to temp buffer for parsing
                      char fr_buf[32] = {0};
                      size_t len = val.len < sizeof(fr_buf) - 1 ? val.len : sizeof(fr_buf) - 1;
                      memcpy(fr_buf, val.str, len);
                      response.finish_reason = _XAI__parse_finish_reason(fr_buf);
                    }
                  } else {
                    Json__any(&json);  // Skip other fields (index, etc.)
                  }
                }
                Json__object_end(&json);
              }
              // Skip remaining choices
              while (Json__array_item(&json)) {
                // Skip each additional choice object
                u32 depth = 1;
                if (Json__object_begin(&json)) {
                  while (depth > 0 && Json__any(&json)) {
                    if (json.token == JSON_OCURLY)
                      depth++;
                    else if (json.token == JSON_CCURLY)
                      depth--;
                  }
                }
              }
              Json__array_end(&json);
            }
          } else if (cstr__eq(5, "usage", key.str)) {
            if (Json__object_begin(&json)) {
              Str8 usage_key = {0};
              while (Json__object_key(&json, &usage_key)) {
                if (cstr__eq(13, "prompt_tokens", usage_key.str)) {
                  f64 val = 0;
                  if (Json__number(&json, &val)) {
                    response.prompt_tokens = (u32)val;
                  }
                } else if (cstr__eq(17, "completion_tokens", usage_key.str)) {
                  f64 val = 0;
                  if (Json__number(&json, &val)) {
                    response.completion_tokens = (u32)val;
                  }
                } else {
                  Json__any(&json);  // Skip other usage fields
                }
              }
              Json__object_end(&json);
            }
          } else {
            Json__any(&json);  // Skip other top-level fields (id, object, etc.)
          }
        }
        Json__object_end(&json);
      }

      _Json_suppress_errors = false;

      // Parse tool_calls if finish_reason is tool_calls (using dedicated parser)
      if (response.finish_reason == FINISH_REASON_TOOL_CALLS) {
        _XAI__parse_tool_calls(curl_data, &response.message);
      }
    } else {
      response.success = false;
      snprintf(
          response.error,
          sizeof(response.error),
          "HTTP %ld: %.200s",
          http_code,
          curl_size > 0 ? curl_data : "(null)");
    }
  }

  curl_slist_free_all(headers);
  curl_easy_cleanup(curl);

  // No free() needed - json_payload/escaped from frameArena, response from curlArena

  return response;
}
