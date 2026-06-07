#define ENGINE_TEST
#include "../../../../../../src/unity.h"

// Mock IO/RingBuffer if needed, but they are likely included via unity.h + source files
// Actually, unity.h only has declarations. The implementation is in src/app/common/*.c
// The makefile compiles SOURCES := $(shell find src -name '*.c')
// But for build_test, it only compiles the test file?
// Let's check the makefile again.

/*
build_test:
	$(CLANG) test/unit/app/common/$(TEST).c $(LIBS) -o build/$(TEST)
*/

// It does NOT link against SOURCES. So I need to include the implementation files directly in the test file
// or link against them.
// The existing tests likely include the .c files directly.
// Let's check test/unit/app/common/Sock.c again.
// It includes "../../../../src/unity.h".
// It doesn't seem to include .c files.
// Wait, if it doesn't link against SOURCES, how does it get Arena__Alloc?
// Maybe it relies on the test file including the .c files?
// Or maybe I missed something in the makefile.

// "SOURCES := $(shell find src -name '*.c')" is used for "build/main".
// "build_test" only compiles the test file.
// So the test file MUST include the implementation files it needs.

#include "../../../../../../src/app/common/Arena.c"
#include "../../../../../../src/app/common/CRC.c"
#include "../../../../../../src/app/common/ChaCha.c"
#include "../../../../../../src/app/common/IO.c"
#include "../../../../../../src/app/common/Log.c"
#include "../../../../../../src/app/common/Math.c"
#include "../../../../../../src/app/common/RingBuffer.c"
#include "../../../../../../src/app/common/String.c"
#include "../../../../../../src/app/common/Time.c"
#include "../../../../../../src/app/plugins/agent/models/Message.c"

// Test 1: Serialization Round Trip
void test_serialization() {
  u8 buffer[1024];
  RingBuffer rb = {buffer, sizeof(buffer), 0, 0};
  IO io = {&rb};

  CmdMessage original = {.id = 12345, .parent_id = 67890, .state = CMD_RUNNING, .progress = 50};
  strcpy(original.term, "term-1");
  strcpy(original.worker, "worker-1");
  strcpy(original.cmd, "fs.read");
  strcpy(original.args, "{\"path\": \"/tmp/test\"}");
  strcpy(original.result, "{\"status\": \"ok\"}");

  // Serialize
  MSG_WriteCmd(&io, &original);
  ASSERT(io.err == 0);
  ASSERT(io.written > 0);

  // Deserialize from the same buffer (read from tail, don't reset)
  CmdMessage deserialized = {0};

  u8 code = 0;
  IO_ReadU8(&io, &code);
  printf("Read code: %d, Expected MSG_CMD: %d\n", code, MSG_CMD);
  ASSERT(code == MSG_CMD);

  MSG_ReadCmd(&io, &deserialized);
  ASSERT(io.err == 0);

  // Assertions
  ASSERT(deserialized.id == original.id);
  ASSERT(deserialized.parent_id == original.parent_id);
  ASSERT(strcmp(deserialized.term, original.term) == 0);
  ASSERT(strcmp(deserialized.worker, original.worker) == 0);
  ASSERT(strcmp(deserialized.cmd, original.cmd) == 0);
  ASSERT(strcmp(deserialized.args, original.args) == 0);
  ASSERT(strcmp(deserialized.result, original.result) == 0);
  ASSERT(deserialized.state == original.state);
  ASSERT(deserialized.progress == original.progress);

  printf("Serialization test passed.\n");
}

// Test 2: CL_SESSION_CREATE Serialization Round Trip
void test_session_create() {
  printf("\n=== Test CL_SESSION_CREATE ===\n");
  
  u8 buffer[4096];
  RingBuffer rb = {buffer, sizeof(buffer), 0, 0};

  const char* template_name = "tooltest";
  const char* template_body = "apiVersion: daemon/v1\nkind: Agent\n";
  const char* prompt = "List the files in src directory";

  // Create a socket with the ring buffer
  Socket sock = {0};
  sock.reliable = rb;

  // Serialize via socket
  IO io = {&sock.reliable};
  IO_WriteU8(&io, CL_SESSION_CREATE);
  IO_WriteStr8(&io, &(Str8){(char*)template_name, strlen(template_name)});
  IO_WriteStr8(&io, &(Str8){(char*)template_body, strlen(template_body)});
  IO_WriteStr8(&io, &(Str8){(char*)prompt, strlen(prompt)});
  
  ASSERT(io.err == 0);
  ASSERT(io.written > 0);
  printf("Wrote %u bytes\n", io.written);

  // Deserialize from the same buffer (read from tail, don't reset)
  u8 code = 0;
  IO_ReadU8(&io, &code);
  printf("Read code: %d, Expected CL_SESSION_CREATE: %d\n", code, CL_SESSION_CREATE);
  ASSERT(code == CL_SESSION_CREATE);

  // Deserialize
  char read_template[256] = {0};
  char read_body[1024] = {0};
  char read_prompt[512] = {0};
  
  MSG_ReadSessionCreate(&io, read_template, sizeof(read_template), 
                       read_body, sizeof(read_body),
                       read_prompt, sizeof(read_prompt));
  ASSERT(io.err == 0);

  printf("Read template: '%s'\n", read_template);
  printf("Read body: '%s'\n", read_body);
  printf("Read prompt: '%s'\n", read_prompt);
  ASSERT(strcmp(read_template, template_name) == 0);
  ASSERT(strcmp(read_body, template_body) == 0);
  ASSERT(strcmp(read_prompt, prompt) == 0);

  printf("Session create test passed.\n");
}

int main() {
  _G->arena = Arena__Alloc(1024 * 1024);
  test_serialization();
  test_session_create();
  return 0;
}
