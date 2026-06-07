#define ENGINE_TEST
#include "../../../../src/unity.h"

// Test 1: Registry Init
void test_registry_init() {
  CmdRegistry reg = {0};
  CmdRegistry__init(&reg, 10);
  ASSERT(reg.capacity == 10);
  ASSERT(reg.count == 0);
  ASSERT(reg.commands != NULL);
  ASSERT(reg.states != NULL);
  printf("Registry Init test passed.\n");
}

// Test 2: Registry Add
void test_registry_add() {
  CmdRegistry reg = {0};
  CmdRegistry__init(&reg, 10);

  CmdMessage cmd = {.id = 1, .state = CMD_PENDING};
  strcpy(cmd.cmd, "help");

  bool added = CmdRegistry__add(&reg, &cmd);
  ASSERT(added == true);
  ASSERT(reg.count == 1);
  ASSERT(reg.commands[0].id == 1);
  ASSERT(reg.states[0].state == CMD_RUNNING);  // Should be set to RUNNING on add

  printf("Registry Add test passed.\n");
}

// Test 3: Registry Tick (Help Command)
void test_registry_tick() {
  // Setup global state
  _G->mode = MODE_HUB;
  _G->session_ct = 0;

  // Setup a fake session for "term-1"
  NetSession* session = &_G->sessions[0];
  strcpy(session->name, "term-1");
  session->active = true;

  // Setup session reliable buffer
  u8 buffer[4096];
  RB_Alloc(_G->arena, &session->reliable, 4096);
  // Wait, RB_Alloc allocates from arena.
  // Or I can just set it up manually if I want to control the buffer pointer.
  // RB_Alloc sets session->reliable.data to arena ptr.
  // That's fine.

  _G->session_ct = 1;

  // Setup Registry
  CmdRegistry reg = {0};
  CmdRegistry__init(&reg, 10);

  // Add "help" command
  CmdMessage cmd = {.id = 100, .state = CMD_PENDING};
  strcpy(cmd.term, "term-1");
  strcpy(cmd.cmd, "help");

  CmdRegistry__add(&reg, &cmd);

  // Tick
  CmdRegistry__tick(&reg);

  // Verify command is removed (count should be 0)
  ASSERT(reg.count == 0);

  // Verify result was sent to session
  // Check session->reliable buffer
  ASSERT(RB_Used(&session->reliable) > 0);

  // Read back the message
  IO io = {&session->reliable};

  // Skip MSG_CMD byte (3)
  u8 code = 0;
  IO_ReadU8(&io, &code);
  ASSERT(code == MSG_CMD);

  CmdMessage response = {0};
  MSG_ReadCmd(&io, &response);

  ASSERT(response.id == 100);
  ASSERT(response.state == CMD_COMPLETED);
  ASSERT(strstr(response.result, "Commands: help") != NULL);
  // Verify help message contains template syntax (not old "agent " prefix)
  ASSERT(strstr(response.result, "<template>") != NULL);

  printf("Registry Tick test passed.\n");
}

int main() {
  _G->arena = Arena__Alloc(1024 * 1024);

  test_registry_init();
  test_registry_add();
  test_registry_tick();

  return 0;
}
